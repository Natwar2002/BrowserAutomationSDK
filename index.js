import 'dotenv/config';
import { Agent, OpenAIProvider, Runner, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
import { z } from 'zod';

import { chromium } from 'playwright';
import OpenAI from 'openai';

const openaiClient = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const modelProvider = new OpenAIProvider({ openAIClient: openaiClient });
setDefaultOpenAIClient(openaiClient);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

const browser = await chromium.launch({
    headless: false,
    chromiumSandbox: true,
    env: {},
    args: ['--disable-extensions', '--disable-file-system'],
});

let page;

const openBrowser = tool({
    name: 'open_browser',
    description: 'Open a browser',
    parameters: z.object({}),
    async execute() {
        page = await browser.newPage();
        return "Opened Browser";
    }
});

const takeScreenShot = tool({
    name: 'take_screenshot',
    description: 'Takes a screenshot of the current page and returns base64',
    parameters: z.object({}),
    async execute() {
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        const buffer = await page.screenshot({ fullPage: true, path: `screenshot-${Date.now().toString()}.png` });
        console.log("Screenshot taken");
        return buffer.toString('base64');
    },
});

const openURL = tool({
    name: 'open_url',
    description: 'Go to given URL',
    parameters: z.object({
        url: z.string(),
    }),
    async execute(input) {
        const { url } = input;
        if (!url) {
            return `URL is undefined`;
        }
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            return `Successfully navigated to ${url}`;
        } catch (error) {
            return `Failed to navigate to ${url}: ${error.message}`;
        }
    }
});

const clickOnScreen = tool({
    name: 'click_screen',
    description: 'Clicks on the screen with specified co-ordinates',
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click'),
        y: z.number().describe('Y axis on the screen where we need to click'),
    }),
    async execute(input) {
        const { x, y } = input;
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        if (x !== undefined && y !== undefined) {
            try {
                await page.mouse.click(x, y);
                return `Clicked at (${x}, ${y})`;
            } catch (error) {
                return `Failed to click at (${x}, ${y}): ${error.message}`;
            }
        }
        return 'Coordinates are undefined';
    },
})

const sendKeys = tool({
    name: 'send_keys',
    description: 'Types text at the current focus or specified coordinates',
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click'),
        y: z.number().describe('Y axis on the screen where we need to click'),
        text: z.string(),
    }),
    async execute(input) {
        const { x, y, text } = input;
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        try {
            if (x !== undefined && y !== undefined) {
                await page.mouse.click(x, y);
                await page.waitForTimeout(100);
            }
            await page.keyboard.type(text, { delay: 50 });
            return `Typed: ${text}`;
        } catch (error) {
            return `Failed to type text: ${error.message}`;
        }
    }
});

const doubleClick = tool({
    name: 'double_click',
    description: "Double clicks at the specified screen coordinates.",
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click'),
        y: z.number().describe('y axis on the screen where we need to click'),
    }),
    async execute(input) {
        let { x, y } = input;
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        if (x !== undefined && y !== undefined) {
            try {
                await page.mouse.dblclick(x, y);
                return `Double clicked at (${x}, ${y})`;
            } catch (error) {
                return `Failed to dbl click at (${x}, ${y}): ${error?.message}`
            }
        }
        return 'Coordinates are undefined';
    }
})

const scroll = tool({
    name: 'scroll',
    description: 'Scrolls the page vertically by a given amount',
    parameters: z.object({
        deltaY: z.number().describe('Vertical pixels to scroll (Positive = down, negative = up)'),
    }),
    async execute(input) {
        let { deltaY } = input;
        if (!page) {
            return "No browser page available. Please open browser first.";
        }
        try {
            await page.mouse.wheel(0, deltaY);
            return `Scrolled by ${deltaY} pixels vertically`;
        } catch (error) {
            return `Failed to scroll: ${error?.message}`;
        }
    },
});

const closeBrowser = tool({
    name: "close_browser",
    description: "Closes the browser",
    parameters: z.object({}),
    async execute() {
        try {
            if (page) {
                await page.close();
            }
            await browser.close();
            return "Browser closed successfully";
        } catch (error) {
            return `Failed to close browser: ${error?.message}`;
        }
    },
})


const websiteAutomationAgent = new Agent({
    name: 'WebSite Automation Agent',
    instructions: `
        You are an expert website automation agent that helps users interact with web pages.

        Your role:
        - Assist users in navigating, interacting, and extracting information from websites.
        - Use the available tools effectively to perform any task:
        - open_browser
        - open_url
        - click_screen
        - send_keys
        - double_click
        - scroll_page
        - take_screenshot
        - close_browser

        Rules:
        1. Always start by calling "open_browser" to initialize a new browser tab.
        2. Always take a screenshot after each significant action to confirm the current state.
        3. Decide the next action based on the most recent screenshot (what's visible on the page).
        4. When scrolling, scroll gradually and take screenshots to track progress.
        5. Always close the browser when the task is complete using 'close_browser'.
        6. If an action fails, try alternative approaches or ask the user for clarification.
        7. Describe what you see in screenshots to keep the user informed about progress.
        8. Follow a systematic cycle: **Plan → Execute → Verify → Continue**.
    `,
    tools: [openBrowser, openURL, takeScreenShot, clickOnScreen, scroll, sendKeys, doubleClick],
    model: 'gemini-2.5-flash'
});

async function automate(query) {
    try {
        const runner = new Runner({ modelProvider });
        const result = await runner.run(websiteAutomationAgent, query);
        console.log("Automation completed:", result);
        return result;
    } catch (error) {
        console.error("Automation failed:", error);

        // Cleanup if case of bug
        try {
            await browser.close();
        } catch (cleanupError) {
            console.error("Failed to cleanup browser:", cleanupError);
        }
        throw error;
    }
}

automate('Go to this website https://ui.chaicode.com/ and in the sidebar click on Authentication, then click on login, fill the login credentials and click on login after checking the checkbox.')
    .then(() => {
        console.log("Task completed successfully");
    })
    .catch((error) => {
        console.error("Task failed:", error);
    });