from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_pdf_report(report_data, history):
    """
    Generates a PDF report containing the overall evaluation and full Q&A log.
    Returns the binary PDF content.
    """
    buffer = BytesIO()
    # Margins: 0.5 inch (36 points) for maximum space but professional layout
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles to fit standard letter sizes cleanly
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#6366f1'), # Indigo accent
        spaceAfter=12
    )
    
    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0f172a'), # Slate 900
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'), # Slate 700
        spaceAfter=4
    )
    
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=3
    )
    
    bold_body_style = ParagraphStyle(
        'BoldBody',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    
    story = []
    
    # Header Section
    story.append(Paragraph("IntPrep AI Interview Performance Report", title_style))
    story.append(Spacer(1, 8))
    
    # Metadata Table
    avg_score = 0
    scores_cnt = 0
    for h in history:
        eval_dict = h.get('evaluation') or {}
        if 'score' in eval_dict:
            avg_score += float(eval_dict.get('score', 0))
            scores_cnt += 1
    avg_score_val = (avg_score / scores_cnt) if scores_cnt > 0 else 0
    
    metadata = [
        [Paragraph("Overall Rating", bold_body_style), Paragraph(f"{report_data.get('overall_rating', 'N/A')}/10", body_style),
         Paragraph("Average Score", bold_body_style), Paragraph(f"{avg_score_val:.1f}/10", body_style)],
        [Paragraph("Questions Attempted", bold_body_style), Paragraph(f"{len(history)}", body_style),
         Paragraph("Status", bold_body_style), Paragraph("Completed", body_style)]
    ]
    meta_table = Table(metadata, colWidths=[1.8*inch, 1.8*inch, 1.8*inch, 1.8*inch])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))
    
    # Summary Metrics
    story.append(Paragraph("Executive Summary", h2_style))
    
    # Strong Areas
    story.append(Paragraph("<b>Strong Areas:</b>", bold_body_style))
    for area in report_data.get('strong_areas', []):
        story.append(Paragraph(f"• {area}", bullet_style))
    story.append(Spacer(1, 8))
    
    # Weak Areas
    story.append(Paragraph("<b>Areas for Improvement:</b>", bold_body_style))
    for area in report_data.get('weak_areas', []):
        story.append(Paragraph(f"• {area}", bullet_style))
    story.append(Spacer(1, 8))
    
    # Improvement Plan
    story.append(Paragraph("<b>Study & Action Plan:</b>", bold_body_style))
    story.append(Paragraph(report_data.get('improvement_plan', 'Study the core competencies mentioned in the job description to improve technical answers.'), body_style))
    story.append(Spacer(1, 10))
    
    # Recommended Questions
    story.append(Paragraph("<b>Recommended Practice Questions:</b>", bold_body_style))
    for idx, q in enumerate(report_data.get('recommended_questions', [])):
        story.append(Paragraph(f"{idx+1}. {q}", bullet_style))
        
    story.append(PageBreak())
    
    # Detailed log
    story.append(Paragraph("Detailed Interview Log", title_style))
    story.append(Spacer(1, 10))
    
    for idx, item in enumerate(history):
        q_elements = []
        q_elements.append(Paragraph(f"<b>Question {idx+1}: {item.get('question')}</b> (Type: {item.get('type', 'General')})", bold_body_style))
        q_elements.append(Spacer(1, 4))
        
        q_elements.append(Paragraph(f"<b>Candidate Answer:</b> {item.get('answer', 'N/A')}", body_style))
        q_elements.append(Spacer(1, 4))
        
        # Ratings grid table
        eval_data = item.get('evaluation') or {}
        score_data = [
            ["Overall Score", f"{eval_data.get('score', 0)}/10", "Tech Accuracy", f"{eval_data.get('technical_accuracy', 0)}/10"],
            ["Communication", f"{eval_data.get('communication', 0)}/10", "Confidence", f"{eval_data.get('confidence', 0)}/10"],
            ["Grammar", f"{eval_data.get('grammar', 0)}/10", "", ""]
        ]
        score_table = Table(score_data, colWidths=[1.8*inch, 1.8*inch, 1.8*inch, 1.8*inch])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        q_elements.append(score_table)
        q_elements.append(Spacer(1, 6))
        
        # Missing points
        missing = eval_data.get('missing_points')
        if missing and isinstance(missing, list):
            q_elements.append(Paragraph("<b>Missing Points:</b>", bold_body_style))
            for pt in missing:
                q_elements.append(Paragraph(f"• {pt}", bullet_style))
            q_elements.append(Spacer(1, 4))
            
        # Ideal Answer
        ideal = eval_data.get('ideal_answer')
        if ideal:
            q_elements.append(Paragraph(f"<b>Ideal Answer:</b> {ideal}", body_style))
            q_elements.append(Spacer(1, 4))
            
        # Tips
        tips = eval_data.get('tips')
        if tips and isinstance(tips, list):
            q_elements.append(Paragraph("<b>Tips:</b>", bold_body_style))
            for tip in tips:
                q_elements.append(Paragraph(f"• {tip}", bullet_style))
                
        q_elements.append(Spacer(1, 10))
        story.append(KeepTogether(q_elements))
        
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
