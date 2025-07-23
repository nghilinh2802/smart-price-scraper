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

// DMX Scraper function
async function fetchPriceFromDienmayxanh(page, sku) {
    const url = `https://www.dienmayxanh.com/search?key=${sku}`;
    console.log(`🔍 Đang cào Điện Máy Xanh - SKU: ${sku}`);
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(8000);
        
        const containers = await page.$$("a[data-name], .item[data-name]");
        console.log(`Found ${containers.length} DMX containers`);
        
        for (const container of containers) {
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
                            // Continue with other strategies
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
        console.log(`❌ Error scraping DMX for ${sku}:`, error.message);
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
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
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
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
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

// Main scraping function
async function performScraping(isScheduled = false) {
    console.log('==== BẮT ĐẦU CÀO GIÁ TỪ CẢ 3 WEBSITE ====');
    
    const allResults = [];
    let browser;
    
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--window-size=1920,1080',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Sample products - thay thế bằng data từ Firestore
        const sampleProducts = [
            { code: 'HMH.QUYDR2.23E', name: 'Sample Product 1' },
            { code: 'HBD46PPI60', name: 'Sample Product 2' }
        ];
        
        for (const product of sampleProducts) {
            const sku = product.code;
            console.log(`\n🚀 Processing SKU: ${sku}`);
            
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
            
            await delay(2000);
        }
        
        // Thống kê kết quả
        const successfulDmx = allResults.filter(r => r.supplier === 'Điện Máy Xanh' && r.status === 'found_with_price').length;
        const successfulWh = allResults.filter(r => r.supplier === 'WellHome' && r.status === 'found_with_price').length; 
        const successfulQh = allResults.filter(r => r.supplier === 'Điện Máy Quang Hạnh' && r.status === 'found_with_price').length;
        
        console.log('\n==== THỐNG KÊ KẾT QUẢ ====');
        console.log(`✅ Điện Máy Xanh: ${successfulDmx}/${sampleProducts.length} SKU thành công`);
        console.log(`✅ WellHome: ${successfulWh}/${sampleProducts.length} SKU thành công`);
        console.log(`✅ Điện Máy Quang Hạnh: ${successfulQh}/${sampleProducts.length} SKU thành công`);
        console.log(`📊 Tổng cộng: ${successfulDmx + successfulWh + successfulQh}/${sampleProducts.length * 3} kết quả`);
        
        return allResults;
        
    } catch (error) {
        console.error('❌ Scraping error:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { performScraping };
