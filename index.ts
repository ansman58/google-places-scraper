import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cheerio from "cheerio";
import { Cheerio, Element } from "cheerio";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

interface School {
  placeId: string;
  address: string | undefined;
  category: string | undefined;
  phone: string | undefined;
  googleUrl: string | undefined;
  schWebsite: string | undefined;
  schoolName: string | undefined;
  ratingText: string | undefined;
  stars: number | null;
  numberOfReviews: number | null;
}

const query = "primary and secondary schools in nigeria";

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });

    console.log("Running tests...");
    const page = await browser.newPage();

    await page.goto(
      `https://www.google.com/maps/search/${query.split(" ").join("+")}`
    );

    async function autoScroll(page) {
      await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');

        if (!wrapper) {
          console.log("No wrapper found");
          return;
        }

        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 1000;
          const scrollDelay = 5000;

          var timer = setInterval(async () => {
            const scrollHeightBefore = wrapper.scrollHeight;
            wrapper.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeightBefore) {
              totalHeight = 0;
              // Wait for more content to load
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));

              // Calculate scrollHeight after waiting
              const scrollHeightAfter = wrapper.scrollHeight;

              if (scrollHeightAfter > scrollHeightBefore) {
                // More content loaded, keep scrolling
                console.log("More content loaded, keep scrolling");
                return;
              } else {
                // No more content loaded, stop scrolling
                console.log("Gotten to the end of the page");
                clearInterval(timer);
                resolve();
              }
            }
          }, 200);
        });
      });
    }

    await autoScroll(page);

    const html = await page.content();
    const $ = cheerio.load(html);

    const aTags: Cheerio<Element> = $("a");
    const parents: Cheerio<Element>[] = [];
    aTags.each((i, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      if (href.includes("/maps/place/")) {
        parents.push($(el).parent() as Cheerio<Element>);
      }
    });

    const schools: School[] = [];

    if (!parents || parents.length === 0) {
      console.log("No schools found");
      return;
    }

    parents.forEach((parent) => {
      const url = parent.find("a").attr("href");
      // get a tag where data-value="Website"
      const website = parent.find('a[data-value="Website"]').attr("href");
      // find a div that includes the class fontHeadlineSmall

      const schoolName = parent.find("div.fontHeadlineSmall").text();

      // find span that includes class fontBodyMedium
      const ratingText = parent
        .find("span.fontBodyMedium > span")
        .attr("aria-label");

      // get the first div that includes the class fontBodyMedium
      const bodyDiv = parent.find("div.fontBodyMedium").first();
      const children = bodyDiv.children();
      const lastChild = children.last();
      const firstOfLast = lastChild.children().first();
      const lastOfLast = lastChild.children().last();

      schools.push({
        placeId: `ChI${url?.split("?")?.[0]?.split("ChI")?.[1]}`,
        address: firstOfLast?.text()?.split("·")?.[1]?.trim(),
        category: firstOfLast?.text()?.split("·")?.[0]?.trim(),
        phone: lastOfLast?.text()?.split("·")?.[1]?.trim(),
        googleUrl: url,
        schWebsite: website,
        schoolName,
        ratingText,
        stars: ratingText?.split("stars")?.[0]?.trim()
          ? Number(ratingText?.split("stars")?.[0]?.trim())
          : null,
        numberOfReviews: ratingText
          ?.split("stars")?.[1]
          ?.replace("Reviews", "")
          ?.trim()
          ? Number(
              ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim()
            )
          : null,
      });
    });

    if (schools && schools.length > 0) {
      const filePath = path.join(__dirname, "schools.json");
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(schools, null, 2));
        return;
      }

      let schoolsData: School[] = [];

      const fileContent = fs.readFileSync(filePath, "utf-8");

      if (fileContent) {
        schoolsData = JSON.parse(fileContent);
      }

      const mergedSchools = [...schoolsData];

      for (const school of schools) {
        if (
          !mergedSchools.some(
            (existingSchool) => existingSchool.placeId === school.placeId
          )
        ) {
          mergedSchools.push(school);
        } else {
          console.log("School already exists");
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(mergedSchools, null, 2));
    }

    await browser.close();
  } catch (error) {
    console.error("Error: ", error.message);
  }
})();
