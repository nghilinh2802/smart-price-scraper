const puppeteer = require('puppeteer');

// Helper function delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Optimized parsePrice function - Giữ nguyên từ code cũ
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
        console.log(`💰 Price parsed: "${priceText}" -> ${price}`);
        return price;
    }
    
    console.log(`❌ Could not parse price: "${priceText}"`);
    return null;
}

// Get data from Firestore - Load products, suppliers, urlMappings để cào đủ
async function getScrapingDataFromFirestore(db) {
    try {
        console.log('📊 Fetching data from Firestore...');
        
        const productsSnapshot = await db.collection('products').get();
        const suppliersSnapshot = await db.collection('suppliers').get();
        const urlMappingsSnapshot = await db.collection('urlMappings').get();
        
        const products = productsSnapshot.docs.map(doc => doc.data());
        const suppliers = suppliersSnapshot.docs.map(doc => doc.data());
        const urlMappings = urlMappingsSnapshot.docs.map(doc => doc.data());
        
        console.log(`✅ Fetched ${products.length} products, ${suppliers.length} suppliers, ${urlMappings.length} urlMappings`);
        return { products, suppliers, urlMappings };
        
    } catch (error) {
        console.error('❌ Error fetching data from Firestore:', error);
        return { products: [], suppliers: [], urlMappings: [] };
    }
}

// Fetch functions with retry - Port exact từ code cũ, thêm retry 3 lần để fix timeout/miss data
async function fetchPriceFromDienmayxanh(page, sku, retries = 3) {
    const url = `https://www.dienmayxanh.com/search?key=${sku}`;
    console.log(`🔍 Đang cào Điện Máy Xanh - SKU: ${sku}`);
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });  // Tăng timeout
            await delay(5000);
            
            const containers = await page.$$("li.item.catSearch a.main-contain, [data-name][data-price], li.item, a[data-name], .item[data-name]");
            console.log(`Found ${containers.length} DMX containers on attempt ${attempt}`);
            
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
                        
                        console.log(`✅ DMX Success: ${name} - ${priceFormatted} (${priceNum})`);
                        
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
            
            throw new Error('No valid product found');  // Để retry
        } catch (error) {
            console.log(`❌ DMX Attempt ${attempt} failed for ${sku}: ${error.message}`);
            if (attempt === retries) {
                return {
                    website: 'Điện Máy Xanh',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Không tìm thấy'
                };
            }
            await delay(5000);
        }
    }
}

// Tương tự cho fetchPriceFromWellhome và fetchPriceFromQuanghanh (copy cấu trúc, port logic từ code cũ, thêm retry)

async function fetchPriceFromWellhome(page, sku, retries = 3) {
    const searchUrl = `https://wellhome.asia/search?type=product&q=${sku}`;
    console.log(`🔍 Đang cào WellHome - SKU: ${sku}`);
    
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
                
                console.log(`✅ WellHome Success: ${productData.name} - ${productData.price}`);
                
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
                throw new Error('No product found');
            }
        } catch (error) {
            console.log(`❌ WellHome Attempt ${attempt} failed for ${sku}: ${error.message}`);
            if (attempt === retries) {
                return {
                    website: 'WellHome',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Không tìm thấy'
                };
            }
            await delay(5000);
        }
    }
}

async function fetchPriceFromQuanghanh(page, sku, retries = 3) {
    const searchUrl = `https://dienmayquanghanh.com/tu-khoa?q=${sku}`;
    console.log(`🔍 Đang cào Điện Máy Quang Hạnh - SKU: ${sku}`);
    
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
                
                console.log(`✅ Quang Hạnh Success: ${result.name} - ${result.price}`);
                
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
                throw new Error('No product found');
            }
        } catch (error) {
            console.log(`❌ Quang Hạnh Attempt ${attempt} failed for ${sku}: ${error.message}`);
            if (attempt === retries) {
                return {
                    website: 'Điện Máy Quang Hạnh',
                    sku: sku,
                    name: null,
                    price: null,
                    rawPrice: null,
                    status: 'Không tìm thấy'
                };
            }
            await delay(5000);
        }
    }
}

// Main performScraping - Port full từ code cũ, thêm lưu Firestore giống hệt
async function performScraping(isScheduled = false) {
    console.log('==== BẮT ĐẦU CÀO GIÁ TỪ CẢ 3 WEBSITE ====');
    
    const allResults = [];
    let browser;
    
    try {
        const { products, suppliers, urlMappings } = await getScrapingDataFromFirestore(db);
        
        if (products.length === 0) {
            console.log('❌ No products to scrape');
            return [];
        }
        
        console.log('🚀 Launching browser...');
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
        
        console.log(`📊 Processing ${products.length} products...`);
        
        for (const product of products) {
            const sku = product.code;
            console.log(`\n🚀 Processing SKU: ${sku} (${product.name || 'Unknown product'})`);
            
            const dmxResult = await fetchPriceFromDienmayxanh(page, sku);
            allResults.push({
                sku: dmxResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: dmxResult.website,
                supplier_id: 'dmx',
                product_name: dmxResult.name,
                price: dmxResult.price,
                rawPrice: dmxResult.rawPrice,
                status: dmxResult.status,
                url_scraped: `https://www.dienmayxanh.com/search?key=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(2000);
            
            const whResult = await fetchPriceFromWellhome(page, sku);
            allResults.push({
                sku: whResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: whResult.website,
                supplier_id: 'wh',
                product_name: whResult.name,
                price: whResult.price,
                rawPrice: whResult.rawPrice,
                status: whResult.status,
                url_scraped: `https://wellhome.asia/search?type=product&q=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(2000);
            
            const qhResult = await fetchPriceFromQuanghanh(page, sku);
            allResults.push({
                sku: qhResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: qhResult.website,
                supplier_id: 'qh',
                product_name: qhResult.name,
                price: qhResult.price,
                rawPrice: qhResult.rawPrice,
                status: qhResult.status,
                url_scraped: `https://dienmayquanghanh.com/tu-khoa?q=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(3000);
        }
        
        // Thống kê kết quả - Giữ nguyên từ code cũ
        const successfulDmx = allResults.filter(r => r.supplier === 'Điện Máy Xanh' && r.status === 'Còn hàng').length;
        const successfulWh = allResults.filter(r => r.supplier === 'WellHome' && r.status === 'Còn hàng').length; 
        const successfulQh = allResults.filter(r => r.supplier === 'Điện Máy Quang Hạnh' && r.status === 'Còn hàng').length;
        
        console.log('\n==== THỐNG KÊ KẾT QUẢ ====');
        console.log(`✅ Điện Máy Xanh: ${successfulDmx}/${products.length} SKU thành công`);
        console.log(`✅ WellHome: ${successfulWh}/${products.length} SKU thành công`);
        console.log(`✅ Điện Máy Quang Hạnh: ${successfulQh}/${products.length} SKU thành công`);
        console.log(`📊 Tổng cộng: ${successfulDmx + successfulWh + successfulQh}/${products.length * 3} kết quả`);
        
        return allResults;
        
    } catch (error) {
        console.error('❌ Scraping error:', error);
        throw error;
    } finally {
        if (browser) {
            console.log('🔒 Closing browser...');
            await browser.close();
        }
    }
}

// Lưu vào Firestore giống code cũ - Thêm để lưu session + priceData
async function saveToFirestore(db, sessionId, results) {
    try {
        console.log('💾 Saving to Firestore...');
        
        // Save session
        await db.collection('scrapeSessions').doc(sessionId).set({
            session_id: sessionId,
            start_time: new Date().toISOString(),
            total_results: results.length,
            success_count: results.filter(r => r.status === 'Còn hàng').length,
            status: 'completed'
        });
        
        // Save priceData
        const batch = db.batch();
        results.forEach((result, index) => {
            const docRef = db.collection('priceData').doc(`${sessionId}_${index}`);
            batch.set(docRef, result);
        });
        await batch.commit();
        
        console.log('✅ Saved to Firestore successfully');
    } catch (error) {
        console.error('❌ Error saving to Firestore:', error);
    }
}

module.exports = { performScraping, getScrapingDataFromFirestore, saveToFirestore };
