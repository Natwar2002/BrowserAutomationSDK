# 🤖 Browser Automation Agent

An AI-powered browser automation agent built with **Playwright** and **OpenAI Agents API**.  
Just describe your task in plain English — it will **click, type, scroll, fill forms, and navigate** for you.  

---

## 🚀 Features
- 🖱️ Natural language → real browser actions  
- 📝 Auto form filling (`fill_form_fields`)  
- 📸 Smart screenshot strategy for verification  
- ⚡ Optimized API usage (batch actions, minimal calls)  
- 🔒 Sandbox browser launch with Playwright  

---

## 🛠️ Setup

1. **Clone & Install**
   ```bash
   git clone https://github.com/Natwar2002/BrowserAutomationSDK.git
   cd BrowserAutomationSDK
   npm install
   
2. **Env settings**
    ```bash
    GEMINI_API_KEY=your_api_key_here

2. **Run the agent**
    ```bash
    node index.js