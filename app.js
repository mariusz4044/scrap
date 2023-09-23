import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-extra";
import fs from "fs/promises";
import axios from "axios";

puppeteer.use(StealthPlugin());

import settings from "./settings.js";
import { link } from "fs";
import { Console } from "console";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Bot {
  constructor(settings) {
    this.browser = null;
    this.pageBaselinker = null;

    this.speed = settings.speed;
    this.chromeLink = settings.chrome;
    this.urls = settings.urls;
  }

  async init() {
    if (!this.browser) await this.createConnection();
    const links = await this.parseLinks();

    for (let i in links) {
      const { title, url } = links[i];
      await this.createDir(title);
      const { description } = await this.scrapAliexpress(url);
      await this.downloadImages(title);
      //await this.sendGPTDescription(description);
    }
  }

  async downloadImages(title) {
    const imagesLength =
      (await this.pageAliexpress.$$(".images-view-item img")).length - 1;

    for (let i = 1; i <= imagesLength; i++) {
      const image = await this.pageAliexpress.$eval(
        `.images-view-list li:nth-child(${i}) img`,
        (el) => el.src
      );

      const res = await this.pageImage.goto(
        image.replace("220x220", "640x640")
      );

      const buffer = await res.buffer();

      await fs.writeFile(`./results/${title}/image-${i}.png`, buffer);
    }
  }

  async sendGPTDescription(text) {
    const headers = {
      "Content-Type": "application/json",
      Authorization:
        "Bearer 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",
    };

    const data = {
      messages: [
        {
          role: "user",
          content: `Przekonwertuj poniższy opis aukcji w taki sposób, aby klient przekonał się, że mój produkt jest lepszej jakości od konkurencji, podkreślając jego jakość i niezawodność. Napisz opis produktu w 4 punktach. Odpowiedz daj w nawiasach [Odpowiedz: ]. Następnie daj trzy zalety tego przedmiotu po przecinku w formie [Zaleta1,Zaleta2,Zaleta3]. Produktem jest: " ${text} "`,
        },
      ],
      model: "gpt-4",
    };

    console.log(`Wysyłam opis przedmiotu do GPT`);

    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      data,
      { headers }
    );
    const answer = res.data.choices[0]?.message.content;
    console.log(answer);
  }

  async createDir(title) {
    try {
      await fs.mkdir(`./results/${title}`);
      return true;
    } catch (e) {
      //Directory is exist
      return false;
    }
  }

  async scrapAliexpress(url) {
    await this.pageAliexpress.bringToFront();
    await this.pageAliexpress.goto(url);

    await this.pageAliexpress.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element) {
        element.scrollIntoView();
      }
    }, `#nav-description`);

    await this.waitForElement(this.pageAliexpress, "#product-description");

    await this.waitAndClick(this.pageAliexpress, '[style="min-width: 160px;"]');

    await sleep(this.speed);

    const description = await this.pageAliexpress.$eval(
      `#product-description`,
      (el) => el.innerText
    );

    return { description };
  }

  async parseLinks() {
    const txt = (await fs.readFile("./links.txt", "utf-8")).split("\n");

    const links = txt.map((el) => {
      const [url, ...title] = el.split(" ");
      return {
        url,
        title: title.join(" "),
      };
    });

    return links;
  }

  async createConnection() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        "--start-maximized",
        // "--window-position=-1900,20",
        //Transport window to second monitor.
        "--no-sandbox",
      ],
      executablePath: this.chromeLink,
      userDataDir: `./profiles/testowy`,
    });

    this.pageBaselinker = await this.browser.newPage();
    await this.pageBaselinker.goto(this.urls.baselinker);

    this.pageAliexpress = await this.browser.newPage();
    await this.pageAliexpress.goto(`https://Aliexpress.com`);

    this.pageImage = await this.browser.newPage();
    await this.pageImage.goto(`https://google.pl`);

    await this.pageBaselinker.bringToFront();

    await this.waitForStart();

    return true;
  }

  async waitForStart() {
    await this.pageBaselinker.reload();

    await this.pageBaselinker.evaluateOnNewDocument(() => {
      enterPressed = false;
      document.addEventListener("keydown", (e) => {
        if (e.code === "F2") {
          enterPressed = true;
        }
      });
    });

    try {
      await this.pageBaselinker.waitForFunction("enterPressed", {
        timeout: 0,
      });
    } catch (e) {
      return await this.waitForStart();
    }
  }

  async waitAndClick(page, selector, delay = 20_000) {
    try {
      const url = await page.url();
      console.log(`Czekam na ${selector} na stronie ${url}`);
      const element = await page.waitForSelector(selector, {
        timeout: delay,
      });
      console.log(`Klikam na ${selector} na stronie ${url}`);
      await page.click(selector);

      return element;
    } catch (e) {
      console.log(`Error, sprawdz w pliku errors | waitAndClick`);
      this.createError(e);
      return false;
    }
  }

  async waitForElement(page, selector, delay = 20_000) {
    try {
      const url = await page.url();
      console.log(`Czekam na ${selector} na stronie ${url}`);
      const element = await page.waitForSelector(selector, {
        timeout: delay,
      });

      console.log(`Odnaleziono ${selector} na stronie ${url}`);
      return element;
    } catch (e) {
      console.log(`Error, sprawdz w pliku errors | waitForElement`);
      this.createError(e);
      return false;
    }
  }

  createError(text) {
    fs.appendFile("./errors.txt", `[Error] ${text} \n`);
  }
}

const bot = new Bot(settings);
bot.init();
