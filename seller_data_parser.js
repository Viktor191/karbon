import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import csvWriter from 'csv-writer';

(async () => {
    let browser;
    try {
        // Читаем список ссылок продавцов из JSON-файла
        const linksData = await fs.readFile('seller_links.json', 'utf-8');
        const sellerLinks = JSON.parse(linksData);

        // Настраиваем CSV-писатель
        const createCsvWriter = csvWriter.createObjectCsvWriter;
        const csvFilePath = path.join(process.cwd(), 'seller_data.csv');
        const csvWriterInstance = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'url', title: 'URL' },
                { id: 'headerTitle', title: 'Заголовок H1' },
                { id: 'headerLocation', title: 'Местоположение' },
                { id: 'asideText', title: 'Текст Aside' },
                { id: 'sectionText', title: 'Текст Section' },
                { id: 'relativeSectionText', title: 'Текст Relative Section' },
            ],
        });

        // Запускаем Puppeteer
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        const allData = [];

        for (const link of sellerLinks) {
            console.log(`Обработка ${link}...`);

            await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });

            // Ожидаем загрузки динамического контента
            try {
                await page.waitForSelector('header h1', { timeout: 10000 });
            } catch (error) {
                console.error(`Таймаут ожидания header h1 на ${link}`);
                continue;
            }

            // Извлекаем необходимые данные
            const data = await page.evaluate(() => {
                const result = {};

                // Получаем заголовок H1
                const headerTitleElement = document.querySelector('header h1');
                result.headerTitle = headerTitleElement
                    ? headerTitleElement.innerText.trim()
                    : '';

                // Получаем местоположение из следующего элемента <p>
                const headerLocationElement = headerTitleElement
                    ? headerTitleElement.nextElementSibling
                    : null;
                result.headerLocation = headerLocationElement
                    ? headerLocationElement.innerText.trim()
                    : '';

                // Получаем текст из <aside class="w-full space-y-12">
                const asideElement = document.querySelector('aside.w-full.space-y-12');
                result.asideText = asideElement ? asideElement.innerText.trim() : '';

                // Получаем текст из <section class="space-y-12">
                const sectionElement = document.querySelector('section.space-y-12');
                result.sectionText = sectionElement
                    ? sectionElement.innerText.trim()
                    : '';

                // Получаем текст из <section class="relative space-y-12">
                const relativeSectionElement = document.querySelector(
                    'section.relative.space-y-12'
                );
                result.relativeSectionText = relativeSectionElement
                    ? relativeSectionElement.innerText.trim()
                    : '';

                return result;
            });

            // Добавляем URL к данным
            data.url = link;

            // Добавляем данные в массив
            allData.push(data);

            // Добавляем пустой объект для создания пустой строки в CSV
            allData.push({});

            // Добавляем задержку, чтобы страница успела загрузиться
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Записываем данные в CSV-файл
        await csvWriterInstance.writeRecords(allData);
        console.log(`Данные успешно сохранены в файл ${csvFilePath}`);

        // Закрываем браузер
        await browser.close();
    } catch (error) {
        console.error('Ошибка:', error);
        if (browser) {
            await browser.close();
        }
    }
})();