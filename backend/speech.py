import re

def clean_transcript(text: str) -> str:
    """
    Cleans up a voice transcript by removing common speech filler words
    and normalizing whitespace.
    """
    if not text:
        return ""
    
    # List of common filler words to remove or minimize (case-insensitive)
    # We only clean up minor stutters but keep context intact
    filler_words = [
        r'\buh-huh\b', r'\buh\b', r'\bum\b', r'\bah\b', r'\ber\b', r'\beh\b'
    ]
    
    cleaned = text
    for word in filler_words:
        cleaned = re.sub(word, '', cleaned, flags=re.IGNORECASE)
        
    # Clean up excess spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    # Fix spacing before punctuation
    cleaned = re.sub(r'\s+([,.!?])', r'\1', cleaned)
    
    return cleaned.strip()
