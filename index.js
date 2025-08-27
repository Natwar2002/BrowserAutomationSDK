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
    // chromiumSandbox: true,
    // env: {},
    // args: ['--disable-extensions', '--disable-file-system'],
});

let page;

const openBrowser = tool({
    name: 'open_browser',
    description: 'Open a browser',
    parameters: z.object({}),
    async execute() {
        console.log("\n🚀 TOOL CALLED: open_browser");
        page = await browser.newPage();
        // Set viewport to ensure consistent coordinates
        // await page.setViewportSize({ width: 1920, height: 1080 });
        console.log("\n✅ SUCCESS: Browser opened successfully with viewport 1280x720");
        return "Opened Browser";
    }
});

let ss;
const takeScreenShot = tool({
    name: 'take_screenshot',
    description: 'Takes a screenshot of the current page and returns base64',
    parameters: z.object({
        description: z.string().nullable().describe('Description of what you expect to see or what action was just performed')
    }),
    async execute(input) {
        const { description } = input || {};
        console.log("\n🚀 TOOL CALLED: take_screenshot" + (description ? ` - ${description}` : ""));
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        const buffer = await page.screenshot({ fullPage: true, path: `screenshot-${Date.now().toString()}.png` });
        console.log("\n📸 SUCCESS: Screenshot taken" + (description ? ` - ${description}` : ""));
        ss = buffer.toString('base64');
        return 'Screenshot taken successfully';
    },
});

const openURL = tool({
    name: 'open_url',
    description: 'Go to given URL',
    parameters: z.object({
        url: z.string(),
    }),
    async execute(input) {
        await Promise.resolve(setTimeout(() => { }, 2000));
        const { url } = input;
        console.log(`\n🚀 TOOL CALLED: open_url - Navigating to: ${url}`);
        if (!url) {
            console.log("\n❌ ERROR: URL is undefined");
            return `URL is undefined`;
        }
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            console.log(`\n✅ SUCCESS: Successfully navigated to ${url}`);
            return `Successfully navigated to ${url}`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to navigate to ${url} - ${error?.message}`);
            return `Failed to navigate to ${url}: ${error.message}`;
        }
    }
});

const fillInput = tool({
    name: 'fill_input',
    description: 'Fill an input field by its label, placeholder, or other attributes',
    parameters: z.object({
        identifier: z.string().describe('Text to identify the input (label, placeholder, etc.)'),
        value: z.string().describe('Value to fill in the input'),
        inputType: z.string().nullable().describe('Optional: input type like "email", "password", "text", etc.')
    }),
    async execute(input) {
        const { identifier, value, inputType } = input;
        console.log(`\n🚀 TOOL CALLED: fill_input - Filling "${identifier}" with "${value}"`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }

        try {
            // Try multiple ways to find the input
            const selectors = [
                `input[placeholder*="${identifier}" i]`,
                `input[aria-label*="${identifier}" i]`,
                `input[name*="${identifier}" i]`,
                `input[id*="${identifier}" i]`,
                `label:has-text("${identifier}") + input`,
                `//label[contains(text(), '${identifier}')]/following-sibling::input`,
            ];

            if (inputType) {
                selectors.unshift(`input[type="${inputType}"][placeholder*="${identifier}" i]`);
            }

            let element = null;
            let usedSelector = '';

            for (const selector of selectors) {
                try {
                    element = await page.locator(selector).first();
                    if (await element.isVisible()) {
                        usedSelector = selector;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!element || !(await element.isVisible())) {
                console.log(`\n❌ ERROR: Input field for "${identifier}" not found or not visible`);
                return `Input field for "${identifier}" not found or not visible`;
            }

            await element.fill(value);
            console.log(`\n✅ SUCCESS: Filled "${identifier}" with "${value}" using selector: ${usedSelector}`);
            return `Filled "${identifier}" with "${value}"`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to fill input - ${error.message}`);
            return `Failed to fill input: ${error.message}`;
        }
    }
})

const clickOnScreen = tool({
    name: 'click_screen',
    description: 'Clicks on the screen with specified co-ordinates',
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click'),
        y: z.number().describe('Y axis on the screen where we need to click'),
    }),
    async execute(input) {
        const { x, y } = input;
        console.log(`\n🚀 TOOL CALLED: click_screen - Clicking at coordinates (${x}, ${y})`);
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        if (x !== undefined && y !== undefined) {
            try {
                // Add a small delay and hover before clicking for better reliability
                await page.mouse.move(x, y);
                await page.waitForTimeout(100);
                await page.mouse.click(x, y);
                // Wait a bit after click to let the page respond
                await page.waitForTimeout(500);
                console.log(`\n✅ SUCCESS: Clicked at (${x}, ${y})`);
                return `Clicked at (${x}, ${y})`;
            } catch (error) {
                console.log(`\n❌ ERROR: Failed to click at (${x}, ${y}) - ${error.message}`);
                return `Failed to click at (${x}, ${y}): ${error.message}`;
            }
        }
        return 'Coordinates are undefined';
    },
});

const sendKeys = tool({
    name: 'send_keys',
    description: 'Types text at the current focus or specified coordinates',
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click before typing'),
        y: z.number().describe('Y axis on the screen where we need to click before typing'),
        text: z.string(),
    }),
    async execute(input) {
        console.log("\n🚀 TOOL CALLED: send_keys");
        const { x, y, text } = input;
        console.log(`\n🚀 TOOL CALLED: send_keys - Typing "${text}" at (${x}, ${y})`);
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        try {
            if (x !== undefined && y !== undefined) {
                await page.mouse.click(x, y);
                await page.waitForTimeout(100);
            }
            await page.keyboard.type(text, { delay: 50 });
            console.log(`\n✅ SUCCESS: Typed "${text}"`);
            return `Typed: ${text}`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to type text - ${error.message}`);
            return `Failed to type text: ${error.message}`;
        }
    }
});

// Don't need this but Piyush sir asked to implement, so...
const doubleClick = tool({
    name: 'double_click',
    description: "Double clicks at the specified screen coordinates.",
    parameters: z.object({
        x: z.number().describe('x axis on the screen where we need to click'),
        y: z.number().describe('y axis on the screen where we need to click'),
    }),
    async execute(input) {
        let { x, y } = input;
        console.log(`\n🚀 TOOL CALLED: double_click - Double clicking at (${x}, ${y})`);
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        if (x !== undefined && y !== undefined) {
            try {
                await page.mouse.dblclick(x, y);
                console.log(`\n✅ SUCCESS: Double clicked at (${x}, ${y})`);
                return `Double clicked at (${x}, ${y})`;
            } catch (error) {
                console.log(`\n❌ ERROR: Failed to double click at (${x}, ${y}) - ${error.message}`);
                return `Failed to double click at (${x}, ${y}): ${error.message}`;
            }
        }
        console.log("\n❌ ERROR: Coordinates are undefined");
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
        console.log(`\n🚀 TOOL CALLED: scroll - Scrolling ${deltaY > 0 ? 'down' : 'up'} by ${Math.abs(deltaY)} pixels`);
        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }
        try {
            await page.mouse.wheel(0, deltaY);
            console.log(`\n✅ SUCCESS: Scrolled ${deltaY > 0 ? 'down' : 'up'} by ${Math.abs(deltaY)} pixels`);
            return `Scrolled by ${deltaY} pixels vertically`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to scroll - ${error?.message}`);
            return `Failed to scroll: ${error?.message}`;
        }
    },
});

const closeBrowser = tool({
    name: "close_browser",
    description: "Closes the browser",
    parameters: z.object({}),
    async execute() {
        console.log("\n🚀 TOOL CALLED: close_browser");
        try {
            if (page) {
                await page.close();
            }
            await browser.close();
            console.log("\n✅ SUCCESS: Browser closed successfully");
            return "Browser closed successfully";
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to close browser - ${error.message}`);
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
        - Use the available tools effectively to perform any task.

        Available tools:
        - open_browser: Initialize a new browser tab
        - open_url: Navigate to a specific URL
        - click_screen: Click at specific coordinates
        - send_keys: Type text (optionally at specific coordinates)
        - double_click: Double click at specific coordinates
        - scroll: Scroll the page vertically
        - fill_input: Fill an input field by its label, placeholder, or other attributes
        - take_screenshot: Capture current page state
        - close_browser: Close the browser when done

        BEST PRACTICES:
        1. Use click_element_by_text and find_element_by_text instead of coordinates when possible - it's more reliable
        2. Always take screenshots to verify current state
        3. Look carefully at button text - LOGIN vs SIGNUP are different
        4. Use dummy credentials: i.e First-name: 'Natwar' Last-name: 'Patidar' email: "natwar.spam@gmail.com", password: 'natwar@123' confirm-password: 'natwar@123'

        Rules:
        1. ALWAYS start by calling "open_browser" to initialize a new browser tab.
        2. After opening browser, navigate to the URL using "open_url".
        3. Take screenshot only when the url changes or any tool call that changes the UI.
        4. **CRITICAL**: After taking each screenshot, you MUST describe what you see in detail using console.log to keep the user informed about progress. Include details about:
           - What page/section is currently visible
           - Current state of any forms or interactions
           - Next planned action based on what you observe
        5. Analyze the screenshot carefully to determine the next action.
        6. When scrolling, scroll gradually and take screenshots to track progress.
        7. Always close the browser when the task is complete using 'close_browser'.
        8. Follow a systematic cycle: **Plan → Execute → Screenshot → Describe → Continue**.
        9. Be patient and wait for pages to load before taking actions.
        10. Perform each and every task from the user query in a squential manner.
    `,
    tools: [openBrowser, openURL, takeScreenShot, clickOnScreen, scroll, sendKeys, doubleClick, closeBrowser, fillInput],
    model: 'gemini-2.5-flash',
});

async function automate(query) {
    try {
        const runner = new Runner({ modelProvider });
        const result = await runner.run(websiteAutomationAgent, query);
        console.log("Automation completed:", result.finalOutput);
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

automate('Go to this website https://ui.chaicode.com/ and in the sidebar click on LOGIN(It will redirect to baseurl/auth/login), fill the login form and click on signin after checking the rememberme checkbox.')
    .then(() => {
        console.log("Task completed successfully");
    })
    .catch((error) => {
        console.error("Task failed:", error);
    });