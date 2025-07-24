const puppeteer = require('puppeteer');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePrice(priceText) {
    if (!priceText || priceText === 'Không có' || priceText === 'Không hiển thị') return null;
    
    let cleanPrice = priceText.toString();
    cleanPrice = cleanPrice.replace(/[₫đ\s]/g, '');
    
    if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
        cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
    } else if (cleanPrice.includes('.')) {
        cleanPrice = cleanPrice.replace(/\./g, '');
    } else if (cleanPrice.includes(',')) {
        cleanPrice = cleanPrice.replace(/,/g, '');
    }
    
    const price = parseFloat(cleanPrice);
    
    if (!isNaN(price) && price > 0) {
        return price;
    }
    
    return null;
}

async function getScrapingDataFromFirestore(db) {
    try {
        const productsSnapshot = await db.collection('products').get();
        const suppliersSnapshot = await db.collection('suppliers').get();
        const urlMappingsSnapshot = await db.collection('urlMappings').get();
        
        const products = productsSnapshot.docs.map(doc => doc.data());
        const suppliers = suppliersSnapshot.docs.map(doc => doc.data());
        const urlMappings = urlMappingsSnapshot.docs.map(doc => doc.data());
        
        return { products, suppliers, urlMappings };
    } catch (error) {
        return { products: [], suppliers: [], urlMappings: [] };
    }
}

async function fetchPriceFromDienmayxanh(page, sku, retries = 3) {
    const url = `https://www.dienmayxanh.com/search?key=${sku}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(5000);
            
            const containers = await page.$$("li.item.catSearch a.main-contain, [data-name][data-price], li.item, a[data-name], .item[data-name]");
            
            for (const container of containers) {
                const name = await page.evaluate(el => el.getAttribute('data-name'), container);
                
                if (name && (name.toUpperCase().includes(sku.toUpperCase()) || name.toUpperCase().includes('BOSCH'))) {
                    let priceNum = null;
                    const dataPriceRaw = await page.evaluate(el => el.getAttribute('data-price'), container);
                    if (dataPriceRaw) {
                        priceNum = parseFloat(dataPriceRaw);
                    }
                    
                    if (!priceNum || priceNum < 100000) {
                        const priceEl = await container.$("strong.price, .price strong");
                        if (priceEl) {
                            const priceText = await page.evaluate(el => el.textContent.trim(), priceEl);
                            priceNum = parsePrice(priceText);
                        }
                    }
                    
                    if (priceNum && priceNum > 0) {
                        const priceFormatted = new Intl.NumberFormat('vi-VN').format(priceNum) + '₫';
                        const brand = await page.evaluate(el => el.getAttribute('data-brand'), container);
                        const category = await page.evaluate(el => el.getAttribute('data-cate'), container);
                        
                        return {
                            website: 'Điện Máy Xanh',
                            sku: sku,
                            name: name,
                            price: priceFormatted,
                            rawPrice: priceNum,
                            brand: brand,
                            category: category,
                            status: 'Còn hàng'
                        };
                    }
                }
            }
            
            return {
                website: 'Điện Máy Xanh',
                sku: sku,
                name: null,
                price: null,
                rawPrice: null,
                status: 'Không tìm thấy'
            };
            
        } catch (error) {
            if (attempt === retries) {
                return {
                    website: 'Điện Máy Xanh',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Lỗi kết nối'
                };
            }
            await delay(5000);
        }
    }
}

// Tương tự cho WellHome và QuangHanh (copy logic từ code cũ của bạn, thêm retry như trên)

async function fetchPriceFromWellhome(page, sku, retries = 3) {
    const searchUrl = `https://wellhome.asia/search?type=product&q=${sku}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(3000);
            
            const productData = await page.evaluate(() => {
                const product = document.querySelector(".product-inner");
                if (product) {
                    const nameEl = product.querySelector("h3");
                    const name = nameEl ? nameEl.textContent.trim() : null;
                    
                    let price = "Không hiển thị";
                    const priceEl = product.querySelector("span.price");
                    if (priceEl) {
                        price = priceEl.textContent.trim();
                    }
                    
                    return { name, price, found: true };
                }
                return { found: false };
            });
            
            if (productData.found) {
                const priceNum = parsePrice(productData.price);
                
                return {
                    website: 'WellHome',
                    sku: sku,
                    name: productData.name,
                    price: productData.price,
                    rawPrice: priceNum,
                    brand: 'Bosch',
                    category: 'Gia dụng',
                    status: 'Còn hàng'
                };
            } else {
                return {
                    website: 'WellHome',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Không tìm thấy'
                };
            }
            
        } catch (error) {
            if (attempt === retries) {
                return {
                    website: 'WellHome',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Lỗi kết nối'
                };
            }
            await delay(5000);
        }
    }
}

async function fetchPriceFromQuanghanh(page, sku, retries = 3) {
    const searchUrl = `https://dienmayquanghanh.com/tu-khoa?q=${sku}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(4000);
            
            const result = await page.evaluate((sku) => {
                const priceElements = document.querySelectorAll('.prPrice');
                if (priceElements.length > 0) {
                    const priceElement = priceElements[0];
                    const price = priceElement.textContent.trim();
                    
                    if (price) {
                        let name = `Sản phẩm ${sku}`;
                        const parent = priceElement.parentElement;
                        const titleEl = parent.querySelector('h3, .title');
                        if (titleEl) {
                            name = titleEl.textContent.trim();
                        }
                        
                        return { name, price, found: true };
                    }
                }
                return { found: false };
            }, sku);
            
            if (result.found) {
                const priceNum = parsePrice(result.price);
                
                return {
                    website: 'Điện Máy Quang Hạnh',
                    sku: sku,
                    name: result.name,
                    price: result.price,
                    rawPrice: priceNum,
                    brand: 'Bosch',
                    category: 'Gia dụng',
                    status: 'Còn hàng'
                };
            } else {
                return {
                    website: 'Điện Máy Quang Hạnh',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Không tìm thấy'
                };
            }
            
        } catch (error) {
            if (attempt === retries) {
                return {
                    website: 'Điện Máy Quang Hạnh',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Lỗi kết nối'
                };
            }
            await delay(5000);
        }
    }
}

// Main performScraping - Port full từ code cũ, lưu Firestore giống hệt
async function performScraping(isScheduled = false) {
    const allResults = [];
    let browser;
    
    try {
        const { products, suppliers, urlMappings } = await getScrapingDataFromFirestore(db);
        
        if (products.length === 0) {
            return [];
        }
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        for (const product of products) {
            const sku = product.code;
            
            const dmx = await fetchPriceFromDienmayxanh(page, sku);
            allResults.push(dmx);
            await delay(2000);
            
            const wh = await fetchPriceFromWellhome(page, sku);
            allResults.push(wh);
            await delay(2000);
            
            const qh = await fetchPriceFromQuanghanh(page, sku);
            allResults.push(qh);
            await delay(3000);
        }
        
        // Thống kê
        const successfulDmx = allResults.filter(r => r.website === 'Điện Máy Xanh' && r.status === 'Còn hàng').length;
        const successfulWh = allResults.filter(r => r.website === 'WellHome' && r.status === 'Còn hàng').length; 
        const successfulQh = allResults.filter(r => r.website === 'Điện Máy Quang Hạnh' && r.status === 'Còn hàng').length;
        
        console.log('\n==== THỐNG KÊ KẾT QUẢ ====');
        console.log(`✅ Điện Máy Xanh: ${successfulDmx}/${products.length} SKU thành công`);
        console.log(`✅ WellHome: ${successfulWh}/${products.length} SKU thành công`);
        console.log(`✅ Điện Máy Quang Hạnh: ${successfulQh}/${products.length} SKU thành công`);
        console.log(`📊 Tổng cộng: ${successfulDmx + successfulWh + successfulQh}/${products.length * 3} kết quả`);
        
        return allResults;
        
    } catch (error) {
        console.error('❌ Scraping error:', error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

// Lưu vào Firestore giống code cũ
async function saveToFirestore(db, sessionId, results) {
    const sessionData = {
        session_id: sessionId,
        start_time: new Date().toISOString(),
        total_results: results.length,
        success_count: results.filter(r => r.status === 'Còn hàng').length,
        status: 'completed'
    };
    
    await db.collection('scrapeSessions').doc(sessionId).set(sessionData);
    
    const batch = db.batch();
    results.forEach((result, index) => {
        const docRef = db.collection('priceData').doc(`${sessionId}_${index}`);
        batch.set(docRef, result);
    });
    await batch.commit();
}

module.exports = { performScraping, getScrapingDataFromFirestore, saveToFirestore };
