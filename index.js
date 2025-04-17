const fs = require("fs-extra");
const path = require("path");
const { simpleParser } = require("mailparser");
const { scrapeResumeFromIndeed } = require("./scraper");

// Create an attachments directory for downloads
const attachmentsDir = path.join(__dirname, "attachments");
fs.ensureDirSync(attachmentsDir);

async function parseAndTestEmail() {
  try {
    // Read the actual file
    const filePath = path.join(
      __dirname,
      "tests",
      "06hirm753ept087cqmpvqshlbqvhbb6rlhfcrso1"
    );

    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log("File loaded successfully, length:", fileContent.length);

      // Parse the email content with simpleParser
      console.log("Parsing email with simpleParser...");
      const parsed = await simpleParser(fileContent);

      console.log("Email parsed successfully!");
      console.log("- From:", parsed.from?.text);
      console.log("- Subject:", parsed.subject);
      console.log("- Has HTML content:", !!parsed.html);
      console.log("- HTML content length:", parsed.html?.length || 0);

      // Now work with parsed.html if available
      if (parsed.html) {
        console.log("\nSearching for 'View resume' link in HTML content...");

        // Updated regex based on the screenshot
        const viewResumeRegex =
          /<a href="(https:\/\/cts\.indeed\.com\/v1\/[^"]+)"[^>]*>View resume/i;

        const match = parsed.html.match(viewResumeRegex);

        if (match && match[1]) {
          console.log("✅ Found View resume URL in HTML content:", match[1]);

          // Test with the scraper function if needed
          console.log("\nTrying to scrape the resume...");
          const result = await scrapeResumeFromIndeed(
            parsed.html,
            attachmentsDir,
            "Caleb",
            "Riley"
          );

          if (result) {
            console.log("✅ Successfully scraped resume:", result);
          } else {
            console.log("❌ Failed to scrape resume");
          }
        } else {
          console.log("❌ Couldn't find View resume URL with primary pattern");

          // Try various alternative patterns
          const alternativePatterns = [
            {
              name: "View resume center pattern",
              regex: /View resume<\/center>[^<]*?<a href="([^"]+)"/i,
            },
            {
              name: "View resume roundrect pattern",
              regex:
                /View resume<\/center><\/v:roundrect>[^<]*?<a href="([^"]+)"/i,
            },
            {
              name: "Simple cts.indeed.com link",
              regex: /href="(https:\/\/cts\.indeed\.com\/v1\/[^"]+)"/i,
            },
            {
              name: "Direct inline link",
              regex: /<a href=['"](https:\/\/cts\.indeed\.com[^'"]+)['"]/i,
            },
          ];

          let foundMatch = false;
          for (const pattern of alternativePatterns) {
            const altMatch = parsed.html.match(pattern.regex);
            if (altMatch && altMatch[1]) {
              console.log(`✅ Found URL with ${pattern.name}:`, altMatch[1]);
              foundMatch = true;

              // Test scraping with this URL if needed
              console.log(
                "\nTrying to scrape the resume with alternative URL..."
              );
              const tempHtml = `<a href="${altMatch[1]}">View resume</a>`;
              const result = await scrapeResumeFromIndeed(
                tempHtml,
                attachmentsDir,
                "Caleb",
                "Riley"
              );

              if (result) {
                console.log("✅ Successfully scraped resume:", result);
              } else {
                console.log("❌ Failed to scrape resume");
              }

              break;
            }
          }

          if (!foundMatch) {
            // Search for "View resume" text
            const viewResumeText = parsed.html.indexOf("View resume");
            if (viewResumeText !== -1) {
              console.log(
                "Found 'View resume' text at position:",
                viewResumeText
              );
              console.log("Context (150 chars before and after):");
              const start = Math.max(0, viewResumeText - 150);
              const end = Math.min(parsed.html.length, viewResumeText + 150);
              console.log(parsed.html.substring(start, end));

              // Look for any href near the View resume text
              const contextPart = parsed.html.substring(start, end);
              const nearbyLinkMatch = contextPart.match(/href="([^"]+)"/i);
              if (nearbyLinkMatch && nearbyLinkMatch[1]) {
                console.log("Found nearby link:", nearbyLinkMatch[1]);

                // Try scraping with this URL
                console.log("\nTrying to scrape the resume with nearby URL...");
                const tempHtml = `<a href="${nearbyLinkMatch[1]}">View resume</a>`;
                const result = await scrapeResumeFromIndeed(
                  tempHtml,
                  attachmentsDir,
                  "Caleb",
                  "Riley"
                );

                if (result) {
                  console.log("✅ Successfully scraped resume:", result);
                } else {
                  console.log("❌ Failed to scrape resume");
                }
              }
            } else {
              console.log("❌ Couldn't find 'View resume' text in HTML");

              // Last resort: find any cts.indeed.com links
              const ctsLinks = parsed.html.match(
                /https:\/\/cts\.indeed\.com\/v1\/[^"'\s]+/g
              );
              if (ctsLinks && ctsLinks.length > 0) {
                console.log("\nFound cts.indeed.com links:");
                ctsLinks.forEach((link, i) => console.log(`${i + 1}. ${link}`));
              } else {
                console.log("❌ No cts.indeed.com links found in HTML");
              }
            }
          }
        }
      } else {
        console.log("❌ No HTML content found in the parsed email");
      }
    } else {
      console.log("❌ File not found:", filePath);
    }
  } catch (error) {
    console.error("Error parsing and testing email:", error);
  }
}

async function runTests() {
  console.log("Starting Indeed resume scraper tests...\n");

  // Parse and test the email
  await parseAndTestEmail();

  console.log("\nTests completed!");
}

runTests();
