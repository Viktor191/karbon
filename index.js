import puppeteer from 'puppeteer';
import fs from 'fs/promises';

(async () => {
    let browser;
    try {
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
                        await page.waitForSelector('a.group.relative');
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

        // Сохраняем ссылки в файл
        await fs.writeFile('seller_links.json', JSON.stringify(linksArray, null, 2));
        console.log('Ссылки успешно сохранены в файл seller_links.json');

        // Закрываем браузер
        await browser.close();
    } catch (error) {
        console.error('Ошибка:', error);
        if (browser) {
            await browser.close();
        }
    }
})();