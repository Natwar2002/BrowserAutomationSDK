import 'dotenv/config';
import { Agent, OpenAIProvider, Runner, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents';
import { z } from 'zod';
import { chromium } from 'playwright';
import OpenAI from 'openai';

// Initialize OpenAI client
const openaiClient = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const modelProvider = new OpenAIProvider({ openAIClient: openaiClient });
setDefaultOpenAIClient(openaiClient);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

// Browser instance
const browser = await chromium.launch({
    headless: false,
    chromiumSandbox: true,
    args: ['--disable-extensions', '--disable-file-system'],
});

let page;

const openBrowser = tool({
    name: 'open_browser',
    description: 'Open a new browser instance',
    parameters: z.object({}),
    async execute() {
        console.log("\n🚀 TOOL CALLED: open_browser");
        page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });
        console.log("\n✅ SUCCESS: Browser opened successfully with viewport 1280x800");
        return "Browser opened successfully";
    }
});

const openURL = tool({
    name: 'open_url',
    description: 'Navigate to a specific URL',
    parameters: z.object({
        url: z.string().url().describe('The URL to navigate to'),
    }),
    async execute(input) {
        const { url } = input;
        console.log(`\n🚀 TOOL CALLED: open_url - Navigating to: ${url}`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available. Please open browser first.";
        }

        try {
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 45000
            });
            await page.waitForTimeout(2000); // Additional wait for page stabilization
            console.log(`\n✅ SUCCESS: Successfully navigated to ${url}`);
            return `Navigated to ${url}`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to navigate to ${url} - ${error.message}`);
            return `Failed to navigate to ${url}: ${error.message}`;
        }
    }
});

const takeScreenShot = tool({
    name: 'take_screenshot',
    description: 'Capture a screenshot of the current page and return base64',
    parameters: z.object({
        context: z.string().describe('Description of what action was performed or what to expect in the screenshot')
    }),
    async execute(input) {
        const { context } = input;
        console.log(`\n🚀 TOOL CALLED: take_screenshot - ${context}`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available.";
        }

        try {
            const buffer = await page.screenshot({
                fullPage: true,
                type: 'jpeg',
                quality: 30,
                path: `screenshot-${Date.now()}.jpeg`
            });
            console.log(`\n📸 SUCCESS: Screenshot captured - ${context}`);
            const ss = buffer.toString('base64');
            return 'Screenshot taken';
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to take screenshot - ${error.message}`);
            return `Screenshot failed: ${error.message}`;
        }
    },
});

const findAndClick = tool({
    name: 'find_and_click',
    description: 'Find an element by text, placeholder, or selector and click it',
    parameters: z.object({
        identifier: z.string().describe('Text, placeholder, label, or CSS selector to identify the element'),
        elementType: z.string().describe('Type of element (button, link, input, etc.)')
    }),
    async execute(input) {
        const { identifier, elementType } = input;
        console.log(`\n🚀 TOOL CALLED: find_and_click - Looking for: "${identifier}"`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available.";
        }

        try {
            // Try multiple strategies to find the element
            const selectors = [
                `button:has-text("${identifier}")`,
                `a:has-text("${identifier}")`,
                `input[placeholder*="${identifier}" i]`,
                `[aria-label*="${identifier}" i]`,
                `label:has-text("${identifier}")`,
                `text=${identifier}`,
                identifier // Try as direct selector
            ];

            let element = null;
            let foundSelector = '';

            for (const selector of selectors) {
                try {
                    element = page.locator(selector).first();
                    if (await element.isVisible({ timeout: 3000 })) {
                        foundSelector = selector;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!element || !foundSelector) {
                console.log(`\n❌ ERROR: Element "${identifier}" not found`);
                return `Element "${identifier}" not found`;
            }

            await element.click();
            await page.waitForTimeout(1000); // Wait for action to complete
            console.log(`\n✅ SUCCESS: Clicked on "${identifier}" using selector: ${foundSelector}`);
            return `Clicked on ${identifier}`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to click - ${error.message}`);
            return `Click failed: ${error.message}`;
        }
    }
});

const fillFormFields = tool({
    name: 'fill_form_fields',
    description: 'Fill multiple form fields at once to reduce API calls',
    parameters: z.object({
        fields: z.array(z.object({
            fieldIdentifier: z.string().describe('Label text, placeholder, or field name'),
            value: z.string().describe('Value to fill in the field'),
            fieldType: z.string().describe('Expected field type (text, email, password, etc.)')
        })).describe('Array of field objects to fill')
    }),
    async execute(input) {
        const { fields } = input;
        console.log(`\n🚀 TOOL CALLED: fill_form_fields - Filling ${fields.length} fields`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available.";
        }

        const results = [];

        for (const field of fields) {
            const { fieldIdentifier, value, fieldType } = field;
            console.log(`\n🔧 Processing field: "${fieldIdentifier}" with value: "${value}"`);

            try {
                const selectors = [
                    `input[placeholder*="${fieldIdentifier}" i]`,
                    `input[aria-label*="${fieldIdentifier}" i]`,
                    `input[name*="${fieldIdentifier}" i]`,
                    `input[id*="${fieldIdentifier}" i]`,
                    `label:has-text("${fieldIdentifier}") + input, label:has-text("${fieldIdentifier}") ~ input`,
                    `//label[contains(., '${fieldIdentifier}')]/following::input[1]`
                ];

                if (fieldType) {
                    selectors.unshift(`input[type="${fieldType}"][placeholder*="${fieldIdentifier}" i]`);
                }

                let element = null;
                let usedSelector = '';

                for (const selector of selectors) {
                    try {
                        element = page.locator(selector).first();
                        if (await element.isVisible({ timeout: 3000 })) {
                            usedSelector = selector;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!element || !usedSelector) {
                    console.log(`\n❌ ERROR: Field "${fieldIdentifier}" not found`);
                    results.push(`Field "${fieldIdentifier}" not found`);
                    continue;
                }

                await element.fill(value);
                await page.waitForTimeout(300);
                console.log(`\n✅ SUCCESS: Filled "${fieldIdentifier}" with "${value}"`);
                results.push(`Filled ${fieldIdentifier} with ${value}`);
            } catch (error) {
                console.log(`\n❌ ERROR: Failed to fill field "${fieldIdentifier}" - ${error.message}`);
                results.push(`Failed to fill ${fieldIdentifier}: ${error.message}`);
            }
        }

        return results.join('\n');
    }
});

const scrollPage = tool({
    name: 'scroll_page',
    description: 'Scroll the page vertically or to a specific element',
    parameters: z.object({
        direction: z.enum(['up', 'down', 'to-element']).describe('Scroll direction or target'),
        pixels: z.number().describe('Number of pixels to scroll (for up/down)'),
        elementIdentifier: z.string().describe('Element identifier for scroll-to-element')
    }),
    async execute(input) {
        const { direction, pixels = 500, elementIdentifier } = input;
        console.log(`\n🚀 TOOL CALLED: scroll_page - ${direction} ${pixels ? pixels + 'px' : ''}`);

        if (!page) {
            console.log("\n❌ ERROR: No browser page available");
            return "No browser page available.";
        }

        try {
            if (direction === 'to-element' && elementIdentifier) {
                const element = page.locator(`text=${elementIdentifier}`).first();
                await element.scrollIntoViewIfNeeded();
                await page.waitForTimeout(1000);
            } else {
                const scrollAmount = direction === 'up' ? -pixels : pixels;
                await page.evaluate((amount) => {
                    window.scrollBy(0, amount);
                }, scrollAmount);
                await page.waitForTimeout(800);
            }

            console.log(`\n✅ SUCCESS: Scrolled ${direction}`);
            return `Scrolled ${direction}`;
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to scroll - ${error.message}`);
            return `Scroll failed: ${error.message}`;
        }
    }
});

const closeBrowser = tool({
    name: "close_browser",
    description: "Close the browser instance",
    parameters: z.object({}),
    async Execute() {
        console.log("\n🚀 TOOL CALLED: close_browser");
        try {
            if (page) {
                await page.close();
                page = null;
            }
            await browser.close();
            console.log("\n✅ SUCCESS: Browser closed successfully");
            return "Browser closed";
        } catch (error) {
            console.log(`\n❌ ERROR: Failed to close browser - ${error.message}`);
            return `Close failed: ${error.message}`;
        }
    }
});

const websiteAutomationAgent = new Agent({
    name: 'Website Automation Expert',
    instructions: `
        You are an expert web automation agent that performs precise website interactions.

        IMPORTANT: Use fill_form_fields to fill all form fields in one operation to minimize API calls.

        CORE WORKFLOW:
        1. OPEN_BROWSER → OPEN_URL → ANALYZE → ACT → VERIFY → CONTINUE
        2. Always start with open_browser, then open_url to the target website, then take screenshot
        3. After navigation, take a single screenshot to analyze the page
        4. Use fill_form_fields to fill multiple fields at once to minimize API calls
        5. After filling the form take screenshot and then click on the action button, and then call close browser
        6. Only take additional screenshots when absolutely necessary for verification
        7. Close browser if the task is completed or failed

        API CALL OPTIMIZATION:
        - Use fill_form_fields to process multiple form fields in a single API call
        - Minimize screenshots - only capture when the UI has significantly changed
        - Plan all form filling in a single operation when possible
        - Avoid unnecessary intermediate steps

        SCREENSHOT STRATEGY:
        - Take initial screenshot after page load to understand layout
        - Only take additional screenshots if something unexpected happens
        - Avoid screenshots after each form field fill

        ACTION PRINCIPLES:
        - Use find_and_click for buttons and interactive elements
        - Use fill_form_fields for all form inputs in one go when possible
        - Scroll only when needed to reveal hidden elements

        CRITICAL RULES:
        1. Use fill_form_fields to process all related form fields together
        2. Minimize API calls by batching operations
        3. Close the browser when task is complete
        4. Be methodical and efficient with actions
    `,
    tools: [
        openBrowser,
        openURL,
        takeScreenShot,
        findAndClick,
        fillFormFields,
        scrollPage,
        closeBrowser
    ],
    model: 'gemini-2.5-flash',
});

async function automate(query) {
    try {
        const runner = new Runner({ modelProvider });
        const result = await runner.run(websiteAutomationAgent, query);
        console.log("🎉 Automation completed successfully:", result.finalOutput);
        return result;
    } catch (error) {
        console.error("❌ Automation failed:", error);

        // Cleanup on failure
        try {
            if (browser) {
                await browser.close();
            }
        } catch (cleanupError) {
            console.error("Cleanup failed:", cleanupError);
        }
        throw error;
    }
}

automate(`
    Go to https://www.piyushgarg.dev/guest-book
    Click on "Signin with github"
    Fill the username with: Natwar2002
    password: Natwar@3006
    and click on action button
    wait for autorization, once authorized, you'll be directed to the same url
    and then type a message in input box: "Hello Sir, Natwar Patidar from browser cli agent.
    After filling input, send the message.

    Take screenshots throughout the process to verify each step.
`).then(() => {
    console.log("✅ Task completed successfully");
}).catch((error) => {
    console.error("❌ Task failed:", error);
});