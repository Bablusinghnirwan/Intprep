import os
import json
import traceback
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load default environment variables
load_dotenv()

def get_genai_client(api_key_override=None):
    """
    Configures and returns the official Google GenAI Client.
    Prefers api_key_override if provided, otherwise looks in environment.
    """
    key = api_key_override or os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API Key is missing. Please click the Gear icon in the top right to configure it, or set GEMINI_API_KEY in the backend .env file.")
    return genai.Client(api_key=key)

def format_gemini_error(e):
    """
    Translates raw Google API exception messages into human-friendly guides.
    """
    error_str = str(e)
    # 429 Rate Limit / Quota Exceeded
    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
        return (
            "API Rate Limit Exceeded (429). The Gemini free-tier quota is currently exhausted. "
            "Please wait about 60 seconds before retrying, or configure your personal Gemini API Key "
            "using the gear icon in the top right for unlimited, dedicated access."
        )
    # 400/403 Invalid API key
    elif "400" in error_str or "403" in error_str or "API_KEY_INVALID" in error_str or "invalid" in error_str.lower():
        return (
            "Invalid Gemini API Key. The configured key was rejected by Google. "
            "Please verify and update your API Key using the gear icon in the top-right corner."
        )
    # 503 Service Unavailable / Spikes in demand
    elif "503" in error_str or "UNAVAILABLE" in error_str:
        return (
            "Gemini API is temporarily overloaded (503). The servers are experiencing a spike in demand. "
            "Please try again in a few seconds."
        )
    # Check if it's the missing key error
    elif "Gemini API Key is missing" in error_str:
        return error_str
        
    return f"API Connection Error: {error_str}"

def generate_question(jd_text, mode, difficulty, history, api_key_override=None):
    """
    Generates a single interview question based on the Job Description, mode, difficulty, and history.
    """
    try:
        client = get_genai_client(api_key_override)
        
        # Format history for prompt
        history_str = ""
        if history:
            history_str = "\nPreviously Asked Questions (DO NOT repeat these):\n"
            for item in history:
                history_str += f"- {item.get('question')} ({item.get('type')})\n"

        prompt = f"""
You are an experienced Senior Technical Interviewer.
The candidate has uploaded a Job Description (JD):
---
{jd_text}
---

Your task is to carefully analyze the JD and generate exactly one interview question.
The interview mode is: {mode} (e.g. Technical, HR, Mixed, Rapid Fire)
The target difficulty level is: {difficulty} (Basic, Easy, Medium, Hard)
{history_str}

Generate the question based on:
- Technical Skills
- Programming Languages required
- Projects
- Problem Solving
- Behavioral / Scenario Based
- HR questions if suitable for the mode

Return your response in raw JSON format matching this schema:
{{
  "question": "The interview question text.",
  "type": "Technical", // Can be: 'Technical', 'HR', 'Behavioral', 'Scenario Based', 'Coding', 'Resume Based'
  "difficulty": "{difficulty}"
}}

Ensure that the question difficulty is suitable for "{difficulty}". Make sure it is realistic, professional, and clear.
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        return json.loads(response.text.strip())
    except Exception as e:
        print("Error in generate_question:")
        traceback.print_exc()
        # Fallback question if API fails
        return {
            "question": f"Can you describe your experience working with the core requirements of this role, focusing on your relevant technical achievements?",
            "type": "Technical",
            "difficulty": difficulty
        }

def evaluate_answer(question, answer, jd_text, is_followup=False, api_key_override=None):
    """
    Evaluates the candidate's answer based on the job description.
    Also determines if a follow-up question (cross-question) is needed for weak answers.
    """
    try:
        client = get_genai_client(api_key_override)
        
        prompt = f"""
You are a Senior Interview Panel Member.
Evaluate the candidate's answer professionally.

Job Description Context:
---
{jd_text}
---

Question asked:
"{question}"

Candidate Answer:
"{answer}"

Is this a follow-up cross-question evaluation? {is_followup}

Evaluate the response objectively. Be strict but fair, scoring exactly like a real interviewer.
Score explanation:
- Score: Overall rating out of 10.
- Confidence: Estimate candidate confidence based on tone, phrasing, completeness (out of 10).
- Technical Accuracy: Correctness of technical statements (out of 10).
- Communication: Clarity, structure, articulation (out of 10).
- Grammar: Grammatical accuracy (out of 10).
- Missing Points: Bullet points of key technical details or behavioral context that they missed.
- Ideal Answer: A concise model answer they should have given.
- Tips: Bullet points of actionable improvement feedback.
- Needs Followup: Boolean. Set to true if their answer was weak (score below 7.0), incomplete, or missing a critical point, and this is NOT already a follow-up question. If is_followup is true, set needs_followup to false.
- Followup Question: String. If needs_followup is true, generate a sharp, relevant cross-question based on their weak answer to probe deeper (e.g., if they answered list vs tuple but missed immutability, ask 'What happens if we try to modify a tuple?'). Otherwise leave it empty.

Return your response in raw JSON format matching this schema:
{{
  "score": 8.5,
  "confidence": 8,
  "technical_accuracy": 9,
  "communication": 8,
  "grammar": 9,
  "missing_points": [
    "Mention of list immutability vs mutability",
    "Time complexity details"
  ],
  "ideal_answer": "Model response text...",
  "tips": [
    "Try to structure your answer using the STAR method.",
    "Define terms clearly before diving into comparisons."
  ],
  "needs_followup": false,
  "followup_question": ""
}}
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        return json.loads(response.text.strip())
    except Exception as e:
        print("Error in evaluate_answer:")
        traceback.print_exc()
        friendly_error = format_gemini_error(e)
        return {
            "score": 6.5,
            "confidence": 6,
            "technical_accuracy": 6,
            "communication": 7,
            "grammar": 8,
            "missing_points": [friendly_error],
            "ideal_answer": "The ideal answer would cover details specified in the Job Description regarding this topic.",
            "tips": ["Make sure you speak clearly and elaborate on key technical terms.", "Set your Gemini API Key in the API Setup settings modal (gear icon)."],
            "needs_followup": False,
            "followup_question": ""
        }

def generate_final_report(jd_text, history, api_key_override=None):
    """
    Aggregates the entire interview history and creates a detailed final report.
    """
    try:
        client = get_genai_client(api_key_override)
        
        # Serialize history for evaluation
        history_summary = []
        for i, item in enumerate(history):
            history_summary.append({
                "index": i + 1,
                "question": item.get("question"),
                "type": item.get("type"),
                "answer": item.get("answer"),
                "score": item.get("evaluation", {}).get("score", 0),
                "technical_accuracy": item.get("evaluation", {}).get("technical_accuracy", 0),
                "communication": item.get("evaluation", {}).get("communication", 0),
                "confidence": item.get("evaluation", {}).get("confidence", 0),
                "grammar": item.get("evaluation", {}).get("grammar", 0)
            })
            
        history_json_str = json.dumps(history_summary, indent=2)
        
        prompt = f"""
You are a Senior Technical Recruiter and Career Coach.
Analyze the candidate's complete performance across this interview and generate a final report.

Job Description Context:
---
{jd_text}
---

Interview Q&A Log:
```json
{history_json_str}
```

Generate a detailed final report of their performance.
Include:
- Overall Rating: A score out of 10.
- Weak Areas: Bullet points of general weak subjects or skills.
- Strong Areas: Bullet points of topics they excelled at.
- Most Asked Topics: Topics that came up during the interview based on the JD.
- Recommended Questions: A list of 3-5 recommended practice questions to work on.
- Personalized Improvement Plan: A text paragraph of feedback and resources they should study.

Return your response in raw JSON format matching this schema:
{{
  "overall_rating": 7.8,
  "weak_areas": ["...", "..."],
  "strong_areas": ["...", "..."],
  "most_asked_topics": ["...", "..."],
  "recommended_questions": ["...", "..."],
  "improvement_plan": "..."
}}
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        return json.loads(response.text.strip())
    except Exception as e:
        print("Error in generate_final_report:")
        traceback.print_exc()
        friendly_error = format_gemini_error(e)
        # Default report
        return {
            "overall_rating": 7.0,
            "weak_areas": ["Technical elaboration", "STAR framework structure"],
            "strong_areas": ["Confidence", "Grammar"],
            "most_asked_topics": ["Core job responsibilities"],
            "recommended_questions": ["Tell me about a time you solved a complex technical issue."],
            "improvement_plan": f"Note: Fallback report generated due to API issue. Details: {friendly_error}"
        }
