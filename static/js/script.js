// Global state
const API_BASE = window.location.protocol.startsWith('file') ? 'http://127.0.0.1:5000' : '';
let jdText = "";
let interviewMode = "Technical";
let difficulty = "Medium";
let currentQuestionIndex = 0;
let history = []; // [{ question, type, difficulty, answer, evaluation }]
let currentQuestion = null; // { question, type, difficulty }
let isFollowup = false;
let sessionTimer = null;
let secondsElapsed = 0;
let isRecording = false;
let recognition = null;
let synth = window.speechSynthesis;
let currentUtterance = null;
let reportData = null; // Stored final report object
let draftAnswers = {};
let draftQuestion = null;

// Document elements
const landingSection = document.getElementById("landing-section");
const interviewSection = document.getElementById("interview-section");
const loadingSection = document.getElementById("loading-section");
const evaluationSection = document.getElementById("evaluation-section");
const reportSection = document.getElementById("report-section");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("jd-file-input");
const textPasteArea = document.getElementById("jd-text-paste");

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    setupDragAndDrop();
    loadSavedApiKey();
    // Default selection highlight
    initSelectionStates();
});

// Guide Modal Management
function openHowToUse() {
    document.getElementById("how-to-use-modal").classList.remove("hidden");
}

function closeHowToUse() {
    document.getElementById("how-to-use-modal").classList.add("hidden");
}

// Settings Modal Management
function openKeySettings() {
    document.getElementById("settings-modal").classList.remove("hidden");
}

function closeKeySettings() {
    document.getElementById("settings-modal").classList.add("hidden");
}

function saveKeySettings() {
    const key = document.getElementById("settings-api-key").value.trim();
    if (key) {
        localStorage.setItem("gemini_api_key", key);
        alert("API Configuration saved successfully!");
    } else {
        localStorage.removeItem("gemini_api_key");
        alert("Configuration cleared.");
    }
    closeKeySettings();
}

function clearKeySettings() {
    document.getElementById("settings-api-key").value = "";
    localStorage.removeItem("gemini_api_key");
    alert("API Key cleared.");
    closeKeySettings();
}

function loadSavedApiKey() {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
        document.getElementById("settings-api-key").value = savedKey;
    }
}

function getApiKey() {
    return localStorage.getItem("gemini_api_key") || "";
}

// Drag & Drop JD Files
function setupDragAndDrop() {
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('bg-purple-500/10', 'border-purple-500');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('bg-purple-500/10', 'border-purple-500');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFileUpload(files[0]);
        }
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

function handleFileUpload(file) {
    const promptDiv = document.getElementById("upload-prompt");
    const successDiv = document.getElementById("upload-success");
    const nameSpan = document.getElementById("uploaded-filename");
    const sizeSpan = document.getElementById("uploaded-filesize");

    // Display uploaded filename and size
    nameSpan.innerText = file.name;
    sizeSpan.innerText = (file.size / 1024).toFixed(1) + " KB";

    promptDiv.classList.add("hidden");
    successDiv.classList.remove("hidden");

    // Upload to server
    const formData = new FormData();
    formData.append("file", file);

    // Show inline loading state on dropzone
    nameSpan.innerText = "Extracting text from " + file.name + "...";

    fetch(API_BASE + "/api/upload-jd", {
        method: "POST",
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                removeJdFile(null);
            } else {
                jdText = data.text;
                nameSpan.innerText = file.name;
                console.log("Extracted JD successfully: " + jdText.substring(0, 100) + "...");
            }
        })
        .catch(err => {
            console.error("Upload error:", err);
            alert("Failed to parse the file. Please paste the JD content manually.");
            removeJdFile(null);
        });
}

function removeJdFile(e) {
    if (e) e.stopPropagation();
    fileInput.value = "";
    jdText = "";
    document.getElementById("upload-prompt").classList.remove("hidden");
    document.getElementById("upload-success").classList.add("hidden");
}

// Config Option Selectors
function initSelectionStates() {
    // Selection state is updated dynamically, buttons have correct styling on click
}

function setMode(mode, btn) {
    interviewMode = mode;
    document.querySelectorAll(".mode-btn").forEach(b => {
        b.classList.remove("border-purple-500", "bg-purple-500/10", "text-purple-200");
        b.classList.add("border-white/10", "bg-white/5", "text-slate-400");
    });
    btn.classList.add("border-purple-500", "bg-purple-500/10", "text-purple-200");
    btn.classList.remove("border-white/10", "bg-white/5", "text-slate-400");
}

function setDifficulty(diff, btn) {
    difficulty = diff;
    document.querySelectorAll(".diff-btn").forEach(b => {
        b.classList.remove("border-purple-500", "bg-purple-500/10", "text-purple-200");
        b.classList.add("border-white/10", "bg-white/5", "text-slate-400");
    });
    btn.classList.add("border-purple-500", "bg-purple-500/10", "text-purple-200");
    btn.classList.remove("border-white/10", "bg-white/5", "text-slate-400");
}

// Screen management helper
function showScreen(screen) {
    landingSection.classList.add("hidden");
    interviewSection.classList.add("hidden");
    loadingSection.classList.add("hidden");
    evaluationSection.classList.add("hidden");
    reportSection.classList.add("hidden");

    screen.classList.remove("hidden");
}

// Starts the practice session
function startInterview() {
    // If text paste is loaded, check text area
    const pasted = textPasteArea.value.trim();
    if (pasted) {
        jdText = pasted;
    }

    if (!jdText) {
        alert("Please upload a Job Description (PDF/DOCX) or paste the JD text first.");
        return;
    }

    currentQuestionIndex = 0;
    history = [];
    isFollowup = false;

    // Start session timer
    secondsElapsed = 0;
    document.getElementById("session-timer").innerText = "00:00";
    if (sessionTimer) clearInterval(sessionTimer);
    sessionTimer = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        document.getElementById("session-timer").innerText = `${mins}:${secs}`;
    }, 1000);

    // Fetch first question
    fetchNextQuestion();
}

function fetchNextQuestion() {
    showLoading("Generating Question...", "Crafting customized scenario questions from your Job Description...");

    // Map existing asked questions to avoid duplication
    const prevHistory = history.map(item => ({
        question: item.question,
        type: item.type
    }));

    fetch(API_BASE + "/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jd_text: jdText,
            mode: interviewMode,
            difficulty: difficulty,
            history: prevHistory,
            api_key: getApiKey()
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                resetToDashboard();
                return;
            }

            currentQuestion = data;
            isFollowup = false;

            // Render Interview Screen
            setupQuestionUi();
        })
        .catch(err => {
            console.error(err);
            alert("API connection failure. Standard fallback question generated.");
            currentQuestion = {
                question: "Can you detail your relevant work experience matching this job's core technical focus?",
                type: "Technical",
                difficulty: difficulty
            };
            setupQuestionUi();
        });
}

function setupQuestionUi() {
    // Update Question Card Labels
    document.getElementById("current-question-tag").innerText = `Question ${currentQuestionIndex + 1}`;
    document.getElementById("current-difficulty-tag").innerText = `Difficulty: ${currentQuestion.difficulty || difficulty}`;
    document.getElementById("question-text").innerText = currentQuestion.question;
    
    // Back button visibility
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.classList.remove("hidden");
    }

    // Submit button label
    const submitBtn = document.getElementById("submit-next-btn");
    if (submitBtn) {
        if (currentQuestionIndex < history.length) {
            submitBtn.innerHTML = `UPDATE & NEXT <i class="fa-solid fa-chevron-right ml-1"></i>`;
        } else {
            submitBtn.innerHTML = `SUBMIT & NEXT <i class="fa-solid fa-chevron-right ml-1"></i>`;
        }
    }

    // Fill transcript text
    let textValue = "";
    if (currentQuestionIndex < history.length) {
        textValue = history[currentQuestionIndex].answer;
    } else {
        textValue = draftAnswers[currentQuestionIndex] || "";
    }
    document.getElementById("transcript-input").value = textValue;
    
    // Switch Screen
    showScreen(interviewSection);
    
    // Read aloud automatically only if there is no current text response
    if (!textValue.trim()) {
        setTimeout(() => {
            speakQuestion();
        }, 400);
    }
}

// Text to Speech
function speakQuestion() {
    if (!synth) return;

    // Cancel existing speak
    synth.cancel();

    const textToSpeak = document.getElementById("question-text").innerText;
    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Select a premium/clear English voice if available
    const voices = synth.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith("en-") && v.name.includes("Google")) ||
        voices.find(v => v.lang.startsWith("en-")) ||
        voices[0];

    if (englishVoice) {
        currentUtterance.voice = englishVoice;
    }

    currentUtterance.rate = 1.0;
    currentUtterance.pitch = 1.0;

    // Button state effect
    const btn = document.getElementById("tts-btn");
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i>`;

    currentUtterance.onend = () => {
        btn.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
    };

    currentUtterance.onerror = () => {
        btn.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
    };

    synth.speak(currentUtterance);
}

// Speech to Text (Web Speech API)
function toggleSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Web Speech recognition is not supported in this browser. Please type your response directly in the text editor.");
        return;
    }

    const micBtn = document.getElementById("mic-btn");
    const micIcon = document.getElementById("mic-icon");
    const speakStatusText = document.getElementById("speak-status");
    const textarea = document.getElementById("transcript-input");

    if (isRecording) {
        // Stop recording
        if (recognition) {
            recognition.stop();
        }
        return;
    }

    // Initialize Recognition
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = textarea.value;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("mic-recording");
        micIcon.className = "fa-solid fa-circle-stop animate-pulse";
        speakStatusText.innerText = "Listening... Click to stop";
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += (finalTranscript ? ' ' : '') + event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        textarea.value = finalTranscript + (interimTranscript ? '\n[' + interimTranscript + ']' : '');
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        stopRecordingState();
    };

    recognition.onend = () => {
        stopRecordingState();
        // Remove brackets from text when finished
        textarea.value = textarea.value.replace(/\[.*?\]/g, "").trim();
    };

    recognition.start();
}

function stopRecordingState() {
    isRecording = false;
    const micBtn = document.getElementById("mic-btn");
    const micIcon = document.getElementById("mic-icon");
    const speakStatusText = document.getElementById("speak-status");

    micBtn.classList.remove("mic-recording");
    micIcon.className = "fa-solid fa-microphone";
    speakStatusText.innerText = "Start Speaking";
}

// Submits and proceeds directly to the next question (or goes forward in history)
function submitAndNextQuestion() {
    const answer = document.getElementById("transcript-input").value.trim();
    if (!answer) {
        alert("Please speak or type an answer before submitting.");
        return;
    }

    // Stop speaking/recording if in progress
    if (isRecording) toggleSpeechRecognition();
    if (synth && synth.speaking) synth.cancel();

    if (currentQuestionIndex === history.length) {
        // Store new question in history
        history.push({
            question: currentQuestion.question,
            type: currentQuestion.type,
            difficulty: currentQuestion.difficulty || difficulty,
            answer: answer,
            evaluated: false,
            evaluation: null
        });
        
        // Clear draft for this index
        delete draftAnswers[currentQuestionIndex];
        
        currentQuestionIndex++;
        renderHistoryList();
        fetchNextQuestion();
    } else {
        // Update existing historical item
        const oldAns = history[currentQuestionIndex].answer;
        if (oldAns !== answer) {
            history[currentQuestionIndex].answer = answer;
            history[currentQuestionIndex].evaluated = false;
            history[currentQuestionIndex].evaluation = null;
        }
        
        currentQuestionIndex++;
        renderHistoryList();
        
        // Go forward
        if (currentQuestionIndex < history.length) {
            // Load next historical question
            const historicalItem = history[currentQuestionIndex];
            currentQuestion = {
                question: historicalItem.question,
                type: historicalItem.type,
                difficulty: historicalItem.difficulty
            };
            setupQuestionUi();
        } else {
            // We reached the end of history, restore the latest new question
            if (draftQuestion) {
                currentQuestion = draftQuestion;
                setupQuestionUi();
            } else {
                // If there's no draft question generated yet, fetch a new one
                fetchNextQuestion();
            }
        }
    }
}

// Renders the list of answered questions in the sidebar
function renderHistoryList() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";

    const hasPending = history && history.some(item => !item.evaluated);
    const evalAllBtn = document.getElementById("eval-all-btn");
    if (evalAllBtn) {
        if (hasPending && history.length > 0) {
            evalAllBtn.classList.remove("hidden");
        } else {
            evalAllBtn.classList.add("hidden");
        }
    }

    if (!history || history.length === 0) {
        if (evalAllBtn) evalAllBtn.classList.add("hidden");
        list.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-4">No questions answered yet. Submit your first answer to start logging progress.</p>`;
        return;
    }

    history.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "glass-card rounded-xl p-3 border border-white/5 space-y-2 relative overflow-hidden transition-all hover:bg-white/5";

        // Truncated question preview
        const qText = item.question.length > 50 ? item.question.substring(0, 50) + "..." : item.question;

        let statusHtml = "";
        if (item.evaluated && item.evaluation) {
            const score = parseFloat(item.evaluation.score || 0);
            let pillColor = "bg-pink-500/10 border-pink-500/30 text-pink-300";
            if (score >= 8.0) pillColor = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
            else if (score >= 7.0) pillColor = "bg-amber-500/10 border-amber-500/30 text-amber-300";

            statusHtml = `
                <div class="flex justify-between items-center text-xs">
                    <span class="px-2 py-0.5 rounded-full border ${pillColor} font-mono font-bold">${score.toFixed(1)}/10</span>
                    <button onclick="showEvaluation(${index})" class="text-[10px] text-purple-400 hover:text-purple-300 font-semibold underline cursor-pointer">
                        View Feedback
                    </button>
                </div>
            `;
        } else {
            statusHtml = `
                <div class="flex justify-between items-center text-xs">
                    <span class="text-slate-500 text-[10px] font-medium"><i class="fa-solid fa-clock mr-1"></i>Answered</span>
                    <button id="eval-btn-${index}" onclick="triggerEvaluation(${index})" class="py-1 px-3 rounded-lg bg-purple-500/10 border border-purple-500/30 hover:border-purple-500 text-purple-300 text-[10px] font-bold transition-all cursor-pointer">
                        Evaluate Response
                    </button>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="text-[11px] font-bold text-slate-400">Q${index + 1}: ${item.type}</div>
            <p class="text-xs text-slate-200 font-medium leading-normal">${qText}</p>
            ${statusHtml}
        `;
        list.appendChild(div);
    });
}

// Triggers evaluation for a specific history item
function triggerEvaluation(index) {
    const item = history[index];
    const btn = document.getElementById(`eval-btn-${index}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin mr-1"></i>Evaluating...`;
    }

    fetch(API_BASE + "/api/evaluate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            question: item.question,
            answer: item.answer,
            jd_text: jdText,
            is_followup: item.type.includes("Follow-up") || item.type.includes("Cross"),
            api_key: getApiKey()
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = "Evaluate Response";
                }
                return;
            }

            item.evaluated = true;
            item.evaluation = data;

            // Refresh log
            renderHistoryList();

            // Pop open feedback details
            showEvaluation(index);
        })
        .catch(err => {
            console.error(err);
            alert("API connection failure. Unable to evaluate response.");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = "Evaluate Response";
            }
        });
}

// Opens the evaluation overlay modal and populates the metrics
function showEvaluation(index) {
    const item = history[index];
    const evalData = item.evaluation;
    if (!evalData) return;

    // Set Text Contexts
    document.getElementById("eval-question-text").innerText = item.question;
    document.getElementById("eval-answer-text").innerText = evalData.cleaned_answer || item.answer;

    // Rings value updating
    updateScoreRing("ring-score", "val-score", evalData.score || 0);
    updateScoreRing("ring-technical", "val-technical", evalData.technical_accuracy || 0);
    updateScoreRing("ring-communication", "val-communication", evalData.communication || 0);
    updateScoreRing("ring-confidence", "val-confidence", evalData.confidence || 0);
    updateScoreRing("ring-grammar", "val-grammar", evalData.grammar || 0);

    // Deep suggestions lists
    populateList("eval-missing-list", evalData.missing_points);
    populateList("eval-tips-list", evalData.tips);
    document.getElementById("acc-ideal").innerText = evalData.ideal_answer || "No specific ideal answer structure available.";

    // API Error warning banner controller
    const errorBanner = document.getElementById("eval-error-banner");
    const errorMessage = document.getElementById("eval-error-message");
    if (errorBanner && errorMessage) {
        let isApiError = false;
        let apiErrorText = "";
        if (evalData.missing_points && evalData.missing_points.length === 1) {
            const firstMsg = evalData.missing_points[0];
            if (firstMsg.includes("API Rate Limit") || firstMsg.includes("Invalid Gemini API Key") || firstMsg.includes("API Connection Error") || firstMsg.includes("overloaded")) {
                isApiError = true;
                apiErrorText = firstMsg;
            }
        }
        if (isApiError) {
            errorMessage.innerText = apiErrorText;
            errorBanner.classList.remove("hidden");
        } else {
            errorBanner.classList.add("hidden");
        }
    }

    // Open Modal Overlay
    document.getElementById("evaluation-section").classList.remove("hidden");
}

// Closes the evaluation modal popup
function closeEvaluation() {
    document.getElementById("evaluation-section").classList.add("hidden");
}

function updateScoreRing(ringId, valId, value) {
    const element = document.getElementById(ringId);
    const textVal = document.getElementById(valId);
    const circle = element.querySelector(".circle-val");

    textVal.innerText = parseFloat(value).toFixed(1);

    // Dash Offset: 238.76 is stroke-dasharray (2 * pi * r = 2 * 3.1415 * 38)
    const circumference = 238.76;
    const offset = circumference - (parseFloat(value) / 10) * circumference;
    circle.style.strokeDashoffset = offset;
}

function populateList(elementId, items) {
    const list = document.getElementById(elementId);
    list.innerHTML = "";
    if (items && items.length) {
        items.forEach(item => {
            const li = document.createElement("li");
            li.className = "text-slate-300";
            li.innerHTML = item;
            list.appendChild(li);
        });
    } else {
        const li = document.createElement("li");
        li.className = "text-slate-500 italic";
        li.innerText = "None highlighted.";
        list.appendChild(li);
    }
}

// Next question transition handler
function goToNextQuestion() {
    if (isFollowup) {
        // Set up the follow-up question
        setupQuestionUi();
    } else {
        // Fetch new main question
        fetchNextQuestion();
    }
}

// Navigates to the previous question in the interview history
function goBackQuestion() {
    const currentVal = document.getElementById("transcript-input").value.trim();
    
    if (currentQuestionIndex === history.length) {
        // Save current active input as draft
        draftAnswers[currentQuestionIndex] = currentVal;
        draftQuestion = currentQuestion;
    } else {
        // Save current input to the active historical item
        const oldAns = history[currentQuestionIndex].answer;
        if (oldAns !== currentVal) {
            history[currentQuestionIndex].answer = currentVal;
            history[currentQuestionIndex].evaluated = false;
            history[currentQuestionIndex].evaluation = null;
            renderHistoryList();
        }
    }
    
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        
        // Stop recording/speaking
        if (isRecording) toggleSpeechRecognition();
        if (synth && synth.speaking) synth.cancel();
        
        // Load the previous question
        const historicalItem = history[currentQuestionIndex];
        currentQuestion = {
            question: historicalItem.question,
            type: historicalItem.type,
            difficulty: historicalItem.difficulty
        };
        
        setupQuestionUi();
    } else {
        // Already on Question 1 (index 0). Go back to landing page.
        if (isRecording) toggleSpeechRecognition();
        if (synth && synth.speaking) synth.cancel();
        showScreen(landingSection);
    }
}

// Evaluates all pending responses in parallel
function evaluateAllPending(silent = false) {
    const pendingIndices = [];
    history.forEach((item, index) => {
        if (!item.evaluated) {
            pendingIndices.push(index);
        }
    });

    if (pendingIndices.length === 0) {
        return Promise.resolve();
    }

    // Stop speaking/recording
    if (isRecording) toggleSpeechRecognition();
    if (synth && synth.speaking) synth.cancel();

    // Show loading
    showLoading(
        "Evaluating All Responses...", 
        `Analyzing ${pendingIndices.length} response(s) using Gemini models in parallel. Please wait...`
    );

    const promises = pendingIndices.map(index => {
        const item = history[index];
        return fetch(API_BASE + "/api/evaluate-answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: item.question,
                answer: item.answer,
                jd_text: jdText,
                is_followup: item.type.includes("Follow-up") || item.type.includes("Cross"),
                api_key: getApiKey()
            })
        })
        .then(res => {
            if (!res.ok) throw new Error(`Failed to evaluate question ${index + 1}`);
            return res.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            item.evaluated = true;
            item.evaluation = data;
        })
        .catch(err => {
            console.error(`Error evaluating item at index ${index}:`, err);
            item.evaluated = true;
            item.evaluation = {
                score: 5.0,
                confidence: 5,
                technical_accuracy: 5,
                communication: 5,
                grammar: 5,
                missing_points: ["Connection issues or invalid API key. Click the Gear icon to check your configuration."],
                ideal_answer: "Not available due to evaluation failure.",
                tips: ["Check your API Key in the settings."],
                needs_followup: false,
                followup_question: ""
            };
        });
    });

    return Promise.all(promises)
        .then(() => {
            renderHistoryList();
            if (!silent) {
                showScreen(interviewSection);
            }
        });
}

// Complete interview session and load analytical report page
function finishInterview() {
    if (synth && synth.speaking) synth.cancel();
    if (isRecording && recognition) recognition.stop();

    const pendingCount = history.filter(h => !h.evaluated).length;
    
    let evalPromise = Promise.resolve();
    if (pendingCount > 0) {
        evalPromise = evaluateAllPending(true);
    } else if (history.length === 0) {
        alert("Please answer at least one question first.");
        return;
    }

    evalPromise.then(() => {
        const evaluatedItems = history.filter(h => h.evaluated);
        if (evaluatedItems.length === 0) {
            alert("Please evaluate at least one question to compile your final report.");
            return;
        }

        showLoading("Generating Final Report...", "Synthesizing full session analytics and customized career study plan...");

        fetch(API_BASE + "/api/generate-final-report-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jd_text: jdText,
                history: history,
                api_key: getApiKey()
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                showScreen(interviewSection);
                return;
            }

            reportData = data;
            renderReport();
        })
        .catch(err => {
            console.error(err);
            alert("API connection failure. Unable to build final performance logs.");
            showScreen(interviewSection);
        });
    });
}

function renderReport() {
    // Rating header
    document.getElementById("report-rating-tag").innerText = `Rating: ${parseFloat(reportData.overall_rating).toFixed(1)} / 10`;

    // Average score across questions
    let totalScoreSum = 0;
    let scoresCount = 0;
    history.forEach(item => {
        if (item.evaluation && item.evaluation.score) {
            totalScoreSum += parseFloat(item.evaluation.score);
            scoresCount++;
        }
    });
    const avgScore = scoresCount > 0 ? (totalScoreSum / scoresCount) * 10 : 0;
    document.getElementById("report-avg-score").innerText = `${Math.round(avgScore)}%`;

    // Time expended
    const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
    const secs = (secondsElapsed % 60).toString().padStart(2, '0');
    document.getElementById("report-total-time").innerText = `${mins}:${secs}`;

    // Lists populating
    populateList("report-strong-list", reportData.strong_areas);
    populateList("report-weak-list", reportData.weak_areas);
    populateList("report-topics-list", reportData.most_asked_topics);
    populateList("report-questions-list", reportData.recommended_questions);

    document.getElementById("report-improvement-plan").innerText = reportData.improvement_plan || "";

    // Draw SVG Chart
    drawTrendChart();

    showScreen(reportSection);
}

// Navigates back to active interview section from the report section
function goBackFromReport() {
    showScreen(interviewSection);
}

// Plots local SVG chart mapping candidate confidence trends
function drawTrendChart() {
    const svg = document.getElementById("trend-svg");
    svg.innerHTML = "";

    // Width and height details
    const width = svg.clientWidth || 450;
    const height = svg.clientHeight || 150;
    const padding = 25;

    // We only plot scores of questions in sequence
    const scores = history.map(item => parseFloat(item.evaluation.score || 0));
    if (scores.length < 2) {
        // Draw single line / point
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", width / 2);
        text.setAttribute("y", height / 2);
        text.setAttribute("fill", "#64748b");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "11");
        text.textContent = "More data points needed to map progression trend.";
        svg.appendChild(text);
        return;
    }

    const count = scores.length;
    let points = [];

    for (let i = 0; i < count; i++) {
        const x = padding + (i / (count - 1)) * (width - 2 * padding);
        const y = height - padding - (scores[i] / 10.0) * (height - 2 * padding);
        points.push({ x, y, score: scores[i] });
    }

    // Draw SVG Path line
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < count; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#chart-grad)");
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("filter", "url(#glow)");

    // Define Gradient and Filter
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="chart-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#ec4899" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    `;
    svg.appendChild(defs);
    svg.appendChild(path);

    // Draw point circle nodes
    points.forEach((pt, idx) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", pt.x);
        circle.setAttribute("cy", pt.y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "#0f172a");
        circle.setAttribute("stroke", idx % 2 === 0 ? "#8b5cf6" : "#ec4899");
        circle.setAttribute("stroke-width", "2.5");
        svg.appendChild(circle);

        // Add score label
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", pt.x);
        txt.setAttribute("y", pt.y - 10);
        txt.setAttribute("fill", "#cbd5e1");
        txt.setAttribute("font-size", "9");
        txt.setAttribute("font-weight", "bold");
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = pt.score.toFixed(1);
        svg.appendChild(txt);

        // Add X axis labels at bottom
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", pt.x);
        label.setAttribute("y", height - 5);
        label.setAttribute("fill", "#64748b");
        label.setAttribute("font-size", "8");
        label.setAttribute("text-anchor", "middle");
        label.textContent = `Q${idx + 1}`;
        svg.appendChild(label);
    });
}

// Download PDF Report from server
function downloadReportPdf() {
    if (!reportData || !history.length) {
        alert("No interview records found to download.");
        return;
    }

    // Set loading cursor
    document.body.style.cursor = 'wait';

    fetch(API_BASE + "/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jd_text: jdText,
            history: history,
            report_data: reportData,
            api_key: getApiKey()
        })
    })
        .then(res => {
            if (!res.ok) throw new Error("Failed to download PDF report");
            return res.blob();
        })
        .then(blob => {
            // Stream attachment download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'IntPrep_Interview_Report.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.style.cursor = 'default';
        })
        .catch(err => {
            console.error("PDF download failure:", err);
            alert("Unable to generate PDF document. Please check your network connection.");
            document.body.style.cursor = 'default';
        });
}

// Reset session to go back to landing panel
function resetToDashboard() {
    if (sessionTimer) clearInterval(sessionTimer);
    if (synth && synth.speaking) synth.cancel();
    if (isRecording && recognition) recognition.stop();
    
    currentQuestionIndex = 0;
    history = [];
    isFollowup = false;
    currentQuestion = null;
    reportData = null;
    draftAnswers = {};
    draftQuestion = null;
    
    // Clear elements
    textPasteArea.value = "";
    removeJdFile(null);
    renderHistoryList();
    
    showScreen(landingSection);
}

// Loading state controller
function showLoading(title, desc) {
    document.getElementById("loading-status-title").innerText = title;
    document.getElementById("loading-status-desc").innerText = desc;
    showScreen(loadingSection);
}

// Collapsible accordion triggers
function toggleAccordion(elementId) {
    const element = document.getElementById(elementId);
    const icon = document.getElementById(`icon-${elementId}`);

    if (element.classList.contains("hidden")) {
        element.classList.remove("hidden");
        icon.style.transform = "rotate(180deg)";
    } else {
        element.classList.add("hidden");
        icon.style.transform = "rotate(0deg)";
    }
}
