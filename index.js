import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

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

        // Читаем предыдущий список ссылок, если файл существует
        let previousLinks = [];
        let isFirstRun = false;
        const sellerLinksPath = path.join(dataDir, 'seller_links.json');
        const sellerLinksPreviousPath = path.join(dataDir, 'seller_links_previous.json');
        const newLinksPath = path.join(dataDir, 'new_links.json');
        const removedLinksPath = path.join(dataDir, 'removed_links.json');

        try {
            const previousData = await fs.readFile(sellerLinksPath, 'utf-8');
            previousLinks = JSON.parse(previousData);
        } catch (error) {
            console.log('Предыдущий список ссылок не найден. Это первый запуск.');
            isFirstRun = true;
        }

        // Запускаем браузер в видимом режиме
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        const baseUrl = 'https://karbonhq.com/practicemarketplace/buy';
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        let allLinks = new Set(); // Используем Set для предотвращения дубликатов
        let hasNextPage = true;

        while (hasNextPage) {
            // Собираем ссылки с текущей страницы с фильтрацией нежелательных ссылок
            const links = await page.$$eval('a.group.relative', (anchors) => {
                return anchors
                    .map((anchor) => `https://karbonhq.com${anchor.getAttribute('href')}`)
                    .filter((link) => !link.includes('/sign-up')); // Исключаем ссылки с '/sign-up'
            });

            // Добавляем ссылки в Set
            links.forEach((link) => allLinks.add(link));

            // Ищем контейнер пагинации
            const paginationContainer = await page.$('div.flex.items-center.space-x-3');

            if (paginationContainer) {
                // Ищем все кнопки внутри контейнера пагинации
                const buttons = await paginationContainer.$$('button');

                // Кнопка "Следующая" — последняя кнопка в контейнере
                const nextButton = buttons[buttons.length - 1];

                // Проверяем, что кнопка активна
                if (nextButton) {
                    const isDisabled = await nextButton.evaluate((button) => button.disabled);

                    if (!isDisabled) {
                        console.log('Переход на следующую страницу...');
                        // Получаем номер текущей страницы до клика
                        const currentPageNumber = await page.evaluate(() => {
                            const activeButton = document.querySelector('button.bg-black.text-white');
                            return activeButton ? activeButton.textContent.trim() : null;
                        });

                        await nextButton.click();

                        // Ждём, пока номер текущей страницы изменится
                        await page.waitForFunction(
                            (prevPageNumber) => {
                                const activeButton = document.querySelector('button.bg-black.text-white');
                                const currentPageNumber = activeButton ? activeButton.textContent.trim() : null;
                                return currentPageNumber !== prevPageNumber;
                            },
                            {},
                            currentPageNumber
                        );

                        // Ждём, пока появятся новые ссылки
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждём 2 секунды для загрузки новых элементов
                    } else {
                        hasNextPage = false;
                        console.log('Достигнута последняя страница.');
                    }
                } else {
                    hasNextPage = false;
                    console.log('Кнопка "Следующая" не найдена.');
                }
            } else {
                hasNextPage = false;
                console.log('Контейнер пагинации не найден.');
            }
        }

        // Преобразуем Set в массив
        const linksArray = Array.from(allLinks);

        // Сохраняем предыдущий список ссылок перед перезаписью
        if (!isFirstRun) {
            await fs.writeFile(sellerLinksPreviousPath, JSON.stringify(previousLinks, null, 2));
        }

        // Сохраняем текущий список ссылок
        await fs.writeFile(sellerLinksPath, JSON.stringify(linksArray, null, 2));
        console.log('Ссылки успешно сохранены в файл seller_links.json');

        // Сравниваем текущие ссылки с предыдущими
        let addedLinks = [];
        let removedLinks = [];
        if (!isFirstRun) {
            // Если это не первый запуск, сравниваем списки
            addedLinks = linksArray.filter(link => !previousLinks.includes(link));
            removedLinks = previousLinks.filter(link => !linksArray.includes(link));

            console.log(`Новых ссылок: ${addedLinks.length}`);
            console.log(`Удаленных ссылок: ${removedLinks.length}`);

            // Сохраняем новые и удаленные ссылки для дальнейшего использования
            await fs.writeFile(newLinksPath, JSON.stringify(addedLinks, null, 2));
            await fs.writeFile(removedLinksPath, JSON.stringify(removedLinks, null, 2));
        } else {
            // Первый запуск, считаем, что нет новых или удаленных ссылок
            console.log('Первый запуск, сравнение ссылок не выполняется.');
        }

        // Закрываем браузер
        await browser.close();
    } catch (error) {
        console.error('Ошибка:', error);
        if (browser) {
            await browser.close();
        }
    }
})();