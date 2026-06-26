import sys
import os

# Add backend directory to Python path so gemini, speech, report modules are found
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

# Now import the Flask app
from app import app
