const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const path = require("path");
const fs = require("fs");
const UserAgent = require("user-agents");

async function scrapeResumeFromIndeed(
  html,
  attachmentsDir,
  firstName,
  lastName
) {
  try {
    // Extract the "View resume" URL from the HTML
    const viewResumeRegex =
      /<a href="(https:\/\/cts\.indeed\.com\/v1\/[^"]+)"[^>]*>View resume/i;
    let match = html.match(viewResumeRegex);

    // If we don't find it with that pattern, try alternative patterns
    if (!match || !match[1]) {
      const alternativePatterns = [
        /href=3D"(https:\/\/cts\.indeed\.com\/v1\/[^"]+)"/i,
        /href="(https:\/\/cts\.indeed\.com\/v1\/[^"]+)"/i,
        /https:\/\/cts\.indeed\.com\/v1\/[^"'\s]+/i,
      ];

      for (const pattern of alternativePatterns) {
        match = html.match(pattern);
        if (match && match[1]) {
          console.log(`Found URL with alternative pattern: ${pattern}`);
          break;
        }
      }

      if (!match || !match[1]) {
        console.log("No Indeed resume view URL found in the email");
        return null;
      }
    }

    // Clean up the URL - replace =3D with = and other email encoding artifacts
    let viewResumeUrl = match[1].replace(/=3D/g, "=");
    console.log("Found Indeed resume view URL:", viewResumeUrl);

    // Get a random, realistic user agent
    const userAgent = new UserAgent({ deviceCategory: "desktop" });

    // Launch browser with stealth plugin
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        `--user-agent=${userAgent.toString()}`,
      ],
      ignoreHTTPSErrors: true,
    });

    try {
      const page = await browser.newPage();

      // Set extra headers and browser settings
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      });

      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });

      await page.setUserAgent(userAgent.toString());

      // Browser fingerprint randomization
      await page.evaluateOnNewDocument(() => {
        const newProto = navigator.__proto__;
        delete newProto.webdriver;
        navigator.__proto__ = newProto;

        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en", "es"],
        });

        Object.defineProperty(navigator, "plugins", {
          get: () => {
            return [1, 2, 3, 4, 5].map(() => ({
              name: Math.random().toString(36).substring(7),
              description: Math.random().toString(36).substring(7),
              filename: Math.random().toString(36).substring(7),
              length: Math.floor(Math.random() * 10) + 1,
            }));
          },
        });
      });

      // Add human-like delay
      await new Promise((resolve) =>
        setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000)
      );

      // Navigate to the resume URL
      console.log(`Navigating to ${viewResumeUrl}`);
      const response = await page.goto(viewResumeUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      console.log("Landed on page:", page.url());
      console.log("Status code:", response.status());

      // Human-like delay
      await new Promise((resolve) =>
        setTimeout(resolve, Math.floor(Math.random() * 3000) + 2000)
      );

      // Check for blocking page
      const pageHtml = await page.content();
      if (
        pageHtml.includes("Request Blocked") ||
        pageHtml.includes("You have been blocked")
      ) {
        console.log("DETECTED BLOCKING PAGE. Attempts to bypass failed.");
        await browser.close();
        return {
          error: true,
          message: "Blocked by Indeed's anti-bot protection",
        };
      }

      // Save HTML for debugging
      fs.writeFileSync(path.join(attachmentsDir, "resume_page.html"), pageHtml);
      console.log("Saved page HTML to resume_page.html");

      // Look for download button
      const downloadBtnMatch = pageHtml.match(
        /data-testid="header-download-resume-button"[^>]*href="([^"]+)"/i
      );

      if (downloadBtnMatch && downloadBtnMatch[1]) {
        console.log("Found download button URL in HTML:", downloadBtnMatch[1]);

        // Prepare file info
        let applicantName =
          firstName && lastName
            ? `${firstName}_${lastName}`
            : "Unknown_Applicant";

        applicantName = applicantName.replace(/[^a-zA-Z0-9_]/g, "_");
        const resumeFilename = `${applicantName}_Resume.pdf`;
        const resumeFilePath = path.join(attachmentsDir, resumeFilename);

        // Get download URL
        const downloadUrl = downloadBtnMatch[1];

        // Use fetch API approach
        console.log("Using fetch API approach...");

        // Get cookies from the browser session
        const cookies = await page.cookies();
        const cookieString = cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; ");

        // Use fetch in page context with the cookies
        const result = await page.evaluate(
          async (url, cookieHeader) => {
            try {
              const response = await fetch(url, {
                method: "GET",
                headers: {
                  Cookie: cookieHeader,
                  Accept: "application/pdf",
                },
                credentials: "include",
              });

              if (!response.ok) {
                return {
                  success: false,
                  status: response.status,
                  statusText: response.statusText,
                };
              }

              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();

              // Convert ArrayBuffer to base64
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);

              return { success: true, data: base64 };
            } catch (error) {
              return { success: false, error: error.toString() };
            }
          },
          downloadUrl,
          cookieString
        );

        if (result.success) {
          // Convert base64 to buffer and save
          const buffer = Buffer.from(result.data, "base64");
          fs.writeFileSync(resumeFilePath, buffer);
          console.log(`Resume downloaded via fetch API to: ${resumeFilename}`);

          await browser.close();
          return {
            filename: resumeFilename,
            filepath: resumeFilePath,
          };
        } else {
          console.log("Fetch API approach failed:", result);
          await browser.close();
          return null;
        }
      } else {
        console.log("Could not find download button in HTML");
        await browser.close();
        return null;
      }
    } catch (error) {
      console.error("Error while scraping resume:", error);
      await browser.close();
      return null;
    }
  } catch (error) {
    console.error("Error in scrapeResumeFromIndeed:", error);
    return null;
  }
}

module.exports = { scrapeResumeFromIndeed };
