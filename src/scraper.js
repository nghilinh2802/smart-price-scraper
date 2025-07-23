const puppeteer = require('puppeteer');

// Helper function delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Optimized parsePrice function
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

// Get products from Firestore
async function getProductsFromFirestore(db) {
    try {
        console.log('📊 Fetching products from Firestore...');
        const snapshot = await db.collection('products').get();
        
        if (snapshot.empty) {
            console.log('⚠️ No products found in Firestore, using sample data');
            // Fallback to sample data if Firestore is empty
            return [
                { id: 'sample1', code: 'HMH.QUYDR2.23E', name: 'Máy rửa bát Bosch HMH.QUYDR2.23E' },
                { id: 'sample2', code: 'HBD46PPI60', name: 'Máy rửa chén bát Bosch HBD46PPI60' }
            ];
        }
        
        const products = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            products.push({
                id: doc.id,
                code: data.code || data.sku || data.productCode,
                name: data.name || data.productName,
                ...data
            });
        });
        
        console.log(`✅ Fetched ${products.length} products from Firestore`);
        return products;
        
    } catch (error) {
        console.error('❌ Error fetching products from Firestore:', error);
        console.log('⚠️ Using sample data as fallback');
        return [
            { id: 'sample1', code: 'HMH.QUYDR2.23E', name: 'Máy rửa bát Bosch HMH.QUYDR2.23E' },
            { id: 'sample2', code: 'HBD46PPI60', name: 'Máy rửa chén bát Bosch HBD46PPI60' }
        ];
    }
}

// DMX Scraper function với improved error handling
async function fetchPriceFromDienmayxanh(page, sku) {
    const url = `https://www.dienmayxanh.com/search?key=${sku}`;
    console.log(`🔍 Đang cào Điện Máy Xanh - SKU: ${sku}`);
    
    try {
        await page.goto(url, { 
            waitUntil: 'networkidle0', 
            timeout: 45000 
        });
        await delay(5000);
        
        const containers = await page.$$("a[data-name], .item[data-name]");
        console.log(`Found ${containers.length} DMX containers`);
        
        if (containers.length === 0) {
            console.log(`❌ DMX: No containers found for ${sku}`);
            return {
                website: 'Điện Máy Xanh',
                sku: sku,
                name: null,
                price: null,
                rawPrice: null,
                status: 'Không tìm thấy'
            };
        }
        
        for (const container of containers.slice(0, 3)) { // Check only first 3 results
            try {
                const name = await page.evaluate(el => el.getAttribute('data-name'), container);
                
                if (name && (name.toUpperCase().includes(sku.toUpperCase()) || 
                            name.toUpperCase().includes('BOSCH'))) {
                    
                    let priceNum = null;
                    const dataPriceRaw = await page.evaluate(el => el.getAttribute('data-price'), container);
                    if (dataPriceRaw) {
                        priceNum = parseFloat(dataPriceRaw);
                    }
                    
                    if (!priceNum || priceNum < 100000) {
                        try {
                            const priceEl = await container.$("strong.price, .price strong");
                            if (priceEl) {
                                const priceText = await page.evaluate(el => el.textContent.trim(), priceEl);
                                priceNum = parsePrice(priceText);
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (priceNum && priceNum > 100000) {
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
            } catch (containerError) {
                continue;
            }
        }
        
        console.log(`❌ DMX: No valid product found for ${sku}`);
        return {
            website: 'Điện Máy Xanh',
            sku: sku,
            name: null,
            price: null,
            rawPrice: null,
            status: 'Không tìm thấy'
        };
        
    } catch (error) {
        if (error.message.includes('timeout')) {
            console.log(`⏰ DMX Timeout for ${sku} - website may be slow or blocking requests`);
        } else {
            console.log(`❌ Error scraping DMX for ${sku}:`, error.message);
        }
        
        return {
            website: 'Điện Máy Xanh',
            sku: sku,
            name: null,
            price: null,
            rawPrice: null,
            status: 'Lỗi kết nối'
        };
    }
}

// WellHome Scraper function
async function fetchPriceFromWellhome(page, sku) {
    const searchUrl = `https://wellhome.asia/search?type=product&q=${sku}`;
    console.log(`🔍 Đang cào WellHome - SKU: ${sku}`);
    
    try {
        await page.goto(searchUrl, { 
            waitUntil: 'networkidle0', 
            timeout: 30000 
        });
        await delay(3000);
        
        const productData = await page.evaluate(() => {
            try {
                const product = document.querySelector(".product-inner");
                if (product) {
                    const nameEl = product.querySelector("h3");
                    const name = nameEl ? nameEl.textContent.trim() : null;
                    
                    let price = "Không hiển thị";
                    try {
                        const priceEl = product.querySelector("span.price");
                        if (priceEl) {
                            price = priceEl.textContent.trim();
                        }
                    } catch (e) {
                        price = "Không hiển thị";
                    }
                    
                    return { name, price, found: true };
                }
                return { found: false };
            } catch (error) {
                return { found: false, error: error.message };
            }
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
            console.log(`❌ WellHome: No product found for ${sku}`);
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
        console.log(`❌ Error scraping WellHome for ${sku}:`, error.message);
        return {
            website: 'WellHome',
            sku: sku,
            name: null,
            price: null,
            rawPrice: null,
            status: 'Lỗi kết nối'
        };
    }
}

// QuangHanh Scraper function
async function fetchPriceFromQuanghanh(page, sku) {
    const searchUrl = `https://dienmayquanghanh.com/tu-khoa?q=${sku}`;
    console.log(`🔍 Đang cào Điện Máy Quang Hạnh - SKU: ${sku}`);
    
    try {
        await page.goto(searchUrl, { 
            waitUntil: 'networkidle0', 
            timeout: 30000 
        });
        await delay(4000);
        
        const result = await page.evaluate((sku) => {
            const priceElements = document.querySelectorAll('.prPrice');
            if (priceElements.length > 0) {
                const priceElement = priceElements[0];
                const price = priceElement.textContent.trim();
                
                if (price) {
                    let name = `Sản phẩm ${sku}`;
                    try {
                        const parent = priceElement.parentElement;
                        const titleEl = parent.querySelector('h3, .title');
                        if (titleEl) {
                            name = titleEl.textContent.trim();
                        }
                    } catch (e) {
                        // Keep default name
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
        }
        
        console.log(`❌ Quang Hạnh: No product found for ${sku}`);
        return {
            website: 'Điện Máy Quang Hạnh',
            sku: sku,
            name: null,
            price: null,
            rawPrice: null,
            status: 'Không tìm thấy'
        };
        
    } catch (error) {
        console.log(`❌ Error scraping Quang Hạnh for ${sku}:`, error.message);
        return {
            website: 'Điện Máy Quang Hạnh',
            sku: sku,
            name: null,
            price: null,
            rawPrice: null,
            status: 'Lỗi kết nối'
        };
    }
}

// Main scraping function với Firestore integration
async function performScraping(isScheduled = false) {
    console.log('==== BẮT ĐẦU CÀO GIÁ TỪ CẢ 3 WEBSITE ====');
    
    const allResults = [];
    let browser;
    let db;
    
    try {
        // Initialize Firebase
        const { initializeFirebase } = require('./firebase-config');
        db = initializeFirebase();
        
        // Get products from Firestore
        const products = await getProductsFromFirestore(db);
        
        if (products.length === 0) {
            console.log('❌ No products to scrape');
            return [];
        }
        
        // Initialize Puppeteer với settings tối ưu cho GitHub Actions
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
        
        // Process each product
        for (const product of products) {
            const sku = product.code;
            console.log(`\n🚀 Processing SKU: ${sku} (${product.name || 'Unknown product'})`);
            
            // Cào từ Điện Máy Xanh
            const dmxResult = await fetchPriceFromDienmayxanh(page, sku);
            allResults.push({
                sku: dmxResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: dmxResult.website,
                supplier_id: 'dmx',
                product_name: dmxResult.name,
                price: dmxResult.rawPrice,
                price_formatted: dmxResult.price,
                status: dmxResult.name ? (dmxResult.rawPrice ? 'found_with_price' : 'found_no_price') : 'no_info',
                url_scraped: `https://www.dienmayxanh.com/search?key=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(2000); // Delay between websites
            
            // Cào từ WellHome
            const whResult = await fetchPriceFromWellhome(page, sku);
            allResults.push({
                sku: whResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: whResult.website,
                supplier_id: 'wh',
                product_name: whResult.name,
                price: whResult.rawPrice,
                price_formatted: whResult.price,
                status: whResult.name ? (whResult.rawPrice ? 'found_with_price' : 'found_no_price') : 'no_info',
                url_scraped: `https://wellhome.asia/search?type=product&q=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(2000);
            
            // Cào từ Điện Máy Quang Hạnh
            const qhResult = await fetchPriceFromQuanghanh(page, sku);
            allResults.push({
                sku: qhResult.sku,
                scrape_time: new Date().toISOString(),
                supplier: qhResult.website,
                supplier_id: 'qh',
                product_name: qhResult.name,
                price: qhResult.rawPrice,
                price_formatted: qhResult.price,
                status: qhResult.name ? (qhResult.rawPrice ? 'found_with_price' : 'found_no_price') : 'no_info',
                url_scraped: `https://dienmayquanghanh.com/tu-khoa?q=${sku}`,
                currency: 'VND',
                is_scheduled: isScheduled
            });
            
            await delay(3000); // Longer delay between products
        }
        
        // Thống kê kết quả
        const successfulDmx = allResults.filter(r => r.supplier === 'Điện Máy Xanh' && r.status === 'found_with_price').length;
        const successfulWh = allResults.filter(r => r.supplier === 'WellHome' && r.status === 'found_with_price').length; 
        const successfulQh = allResults.filter(r => r.supplier === 'Điện Máy Quang Hạnh' && r.status === 'found_with_price').length;
        
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

module.exports = { performScraping, getProductsFromFirestore };
