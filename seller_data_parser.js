import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import csvWriter from 'csv-writer';

(async () => {
    let browser;
    try {
        // Создаем путь к директории 'data'
        const dataDir = path.join(process.cwd(), 'data');

        // Проверяем, существует ли директория 'data', если нет — создаем
        try {
            await fs.access(dataDir);
        } catch (error) {
            await fs.mkdir(dataDir);
        }

        // Пути к файлам
        const sellerLinksPath = path.join(dataDir, 'seller_links.json');
        const removedLinksPath = path.join(dataDir, 'removed_links.json');
        const csvFilePath = path.join(process.cwd(), 'seller_data.csv');

        // Читаем текущий список ссылок
        const linksData = await fs.readFile(sellerLinksPath, 'utf-8');
        const sellerLinks = JSON.parse(linksData);

        // Читаем список удаленных ссылок
        let removedLinks = [];
        try {
            const removedData = await fs.readFile(removedLinksPath, 'utf-8');
            removedLinks = JSON.parse(removedData);
        } catch (error) {
            // Файл может отсутствовать при первом запуске
        }

        // Настраиваем CSV-писатель
        const createCsvWriter = csvWriter.createObjectCsvWriter;
        const csvWriterInstance = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'url', title: 'URL' },
                { id: 'status', title: 'Статус' },
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
            const data = {
                url: link,
                status: 'Активна',
                headerTitle: '',
                headerLocation: '',
                asideText: '',
                sectionText: '',
                relativeSectionText: '',
            };

            try {
                await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });

                // Ожидаем загрузки динамического контента
                await page.waitForSelector('header h1', { timeout: 10000 });

                // Извлекаем необходимые данные
                const pageData = await page.evaluate(() => {
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

                // Объединяем данные
                Object.assign(data, pageData);

            } catch (error) {
                console.error(`Ошибка при обработке ${link}:`, error);
                data.status = 'Удалена или недоступна';

                // Добавляем ссылку в список удаленных, если ее там нет
                if (!removedLinks.includes(link)) {
                    removedLinks.push(link);
                }
            }

            // Добавляем данные в массив
            allData.push(data);

            // Добавляем пустой объект для создания пустой строки в CSV
            allData.push({});

            // Добавляем задержку
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Записываем данные в CSV-файл
        await csvWriterInstance.writeRecords(allData);
        console.log(`Данные успешно сохранены в файл ${csvFilePath}`);

        // Обновляем файл removed_links.json
        await fs.writeFile(removedLinksPath, JSON.stringify(removedLinks, null, 2));

        // Закрываем браузер
        await browser.close();
    } catch (error) {
        console.error('Ошибка:', error);
        if (browser) {
            await browser.close();
        }
    }
})();