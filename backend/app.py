import os
import uuid
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pypdf import PdfReader
from docx import Document
from dotenv import load_dotenv

# Import our custom modules
import gemini
import speech
import report

# Load environment configurations
load_dotenv()

app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
CORS(app)

# Configurations
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../uploads')
ALLOWED_EXTENSIONS = {'pdf', 'docx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_pdf(file_path):
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error parsing PDF: {e}")
        return ""

def parse_docx(file_path):
    try:
        doc = Document(file_path)
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error parsing DOCX: {e}")
        return ""

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload-jd', methods=['POST'])
def upload_jd():
    # Check if text was pasted directly
    pasted_text = request.form.get('text')
    if pasted_text and pasted_text.strip():
        return jsonify({"text": pasted_text.strip()})

    # Check for file upload
    if 'file' not in request.files:
        return jsonify({"error": "No file or text provided"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and allowed_file(file.filename):
        # Create a unique filename to avoid collision
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        try:
            file.save(file_path)
            
            # Parse document contents
            if ext == 'pdf':
                extracted_text = parse_pdf(file_path)
            elif ext == 'docx':
                extracted_text = parse_docx(file_path)
            else:
                extracted_text = ""
                
            # Clean up local file after reading to save space
            if os.path.exists(file_path):
                os.remove(file_path)
                
            if not extracted_text:
                return jsonify({"error": "Failed to extract text from file. Please ensure the file is not empty or corrupted."}), 422
                
            return jsonify({"text": extracted_text})
        except Exception as e:
            # Clean up if error occurred
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({"error": f"Internal file upload error: {str(e)}"}), 500
            
    return jsonify({"error": "File type not supported. Please upload a PDF or DOCX file."}), 400

@app.route('/api/generate-question', methods=['POST'])
def api_generate_question():
    data = request.json or {}
    jd_text = data.get('jd_text', '')
    mode = data.get('mode', 'Technical')
    difficulty = data.get('difficulty', 'Easy')
    history = data.get('history', [])
    api_key = data.get('api_key', '')  # Override from UI settings if available
    
    if not jd_text:
        return jsonify({"error": "Job Description (JD) text is required to generate questions."}), 400
        
    question_data = gemini.generate_question(
        jd_text=jd_text,
        mode=mode,
        difficulty=difficulty,
        history=history,
        api_key_override=api_key
    )
    
    return jsonify(question_data)

@app.route('/api/evaluate-answer', methods=['POST'])
def api_evaluate_answer():
    data = request.json or {}
    question = data.get('question', '')
    answer = data.get('answer', '')
    jd_text = data.get('jd_text', '')
    is_followup = data.get('is_followup', False)
    api_key = data.get('api_key', '')
    
    if not question:
        return jsonify({"error": "Question is required for evaluation."}), 400
    if not answer:
        return jsonify({"error": "Candidate answer is required for evaluation."}), 400
    if not jd_text:
        return jsonify({"error": "Job Description context is required for evaluation."}), 400
        
    # Clean the answer transcript
    cleaned_answer = speech.clean_transcript(answer)
    
    evaluation_data = gemini.evaluate_answer(
        question=question,
        answer=cleaned_answer,
        jd_text=jd_text,
        is_followup=is_followup,
        api_key_override=api_key
    )
    
    # Attach cleaned answer back so the UI displays the formatted answer
    evaluation_data['cleaned_answer'] = cleaned_answer
    
    return jsonify(evaluation_data)

@app.route('/api/generate-final-report-data', methods=['POST'])
def api_generate_final_report_data():
    data = request.json or {}
    jd_text = data.get('jd_text', '')
    history = data.get('history', [])
    api_key = data.get('api_key', '')
    
    if not jd_text:
        return jsonify({"error": "Job Description context is required for the final report."}), 400
    if not history:
        return jsonify({"error": "Interview history log is empty."}), 400
        
    report_data = gemini.generate_final_report(
        jd_text=jd_text,
        history=history,
        api_key_override=api_key
    )
    
    return jsonify(report_data)

@app.route('/api/generate-report', methods=['POST'])
def api_generate_report():
    data = request.json or {}
    jd_text = data.get('jd_text', '')
    history = data.get('history', [])
    report_data = data.get('report_data', {})
    api_key = data.get('api_key', '')
    
    if not jd_text:
        return jsonify({"error": "Job Description is required."}), 400
    if not history:
        return jsonify({"error": "Interview history log is required."}), 400
        
    # Generate report data if not provided
    if not report_data:
        report_data = gemini.generate_final_report(
            jd_text=jd_text,
            history=history,
            api_key_override=api_key
        )
        
    try:
        pdf_bytes = report.generate_pdf_report(report_data, history)
        
        # Save pdf bytes temporarily or stream directly
        from io import BytesIO
        return send_file(
            BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='IntPrep_Interview_Report.pdf'
        )
    except Exception as e:
        print(f"Error streaming PDF report: {e}")
        return jsonify({"error": f"Failed to generate PDF document: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
