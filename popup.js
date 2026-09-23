const exportButton = document.getElementById("exportButton");
const status = document.getElementById("status");

exportButton.addEventListener("click", async () => {

    exportButton.disabled = true;
    exportButton.textContent = "Creating Excel...";
    status.textContent = "Reading product options...";

    try {

        // =====================================================
        // 1. GET CURRENT TAB
        // =====================================================

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab || !tab.url) {
            throw new Error(
                "Could not find the current tab."
            );
        }

        if (!tab.url.includes("shop.lululemon.com")) {
            throw new Error(
                "Open a Lululemon product page first."
            );
        }


        // =====================================================
        // 2. RUN EXTRACTOR
        // =====================================================

        status.textContent =
            "Reading colours, sizes and inventory...";


        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            files: [
                "extractor.js"
            ]
        });


        const results =
            await chrome.scripting.executeScript({
                target: {
                    tabId: tab.id
                },

                func: async () => {
                    return await extractLululemonProduct();
                }
            });


        const productData =
            results?.[0]?.result;


        if (!productData) {
            throw new Error(
                "No product data was returned."
            );
        }


        // =====================================================
        // 3. GET SKU + AVAILABILITY DATA
        // =====================================================

        const skuDetails =
            productData.skuResponses?.[0]?.data || [];


        const availabilityData =
            productData.availability?.data || [];


        if (skuDetails.length === 0) {
            throw new Error(
                "No product variants were found."
            );
        }


        // =====================================================
        // 4. BUILD AVAILABILITY LOOKUP
        // =====================================================

        const availability =
            new Map();


        for (const item of availabilityData) {

            availability.set(
                String(item.id),
                Boolean(
                    item.attributes?.isAvailable
                )
            );
        }


        // =====================================================
        // 5. SIZE SORTING
        // =====================================================

        function sizeSortKey(size) {

            const value =
                String(size).trim();


            // ---------------------------------------------
            // NUMERIC SIZES
            //
            // 0, 2, 4, 6, 8, 10, 12...
            // ---------------------------------------------

            if (
                !Number.isNaN(
                    Number(value)
                )
            ) {

                return [
                    0,
                    Number(value)
                ];
            }


            // ---------------------------------------------
            // LETTER SIZES
            //
            // XXXS → XXXL
            // ---------------------------------------------

            const letterOrder = {

                "XXXS": 0,
                "XXS": 1,
                "XS": 2,
                "S": 3,
                "M": 4,
                "L": 5,
                "XL": 6,
                "XXL": 7,
                "XXXL": 8,
                "ONE SIZE": 9
            };


            const upper =
                value.toUpperCase();


            if (
                Object.prototype.hasOwnProperty.call(
                    letterOrder,
                    upper
                )
            ) {

                return [
                    1,
                    letterOrder[upper]
                ];
            }


            // ---------------------------------------------
            // UNKNOWN SIZE FORMAT
            //
            // Keep it after known size formats.
            // ---------------------------------------------

            return [
                2,
                upper
            ];
        }


        // =====================================================
        // 6. BUILD ROWS
        // =====================================================

        const rows = [];


        for (const item of skuDetails) {

            const skuId =
                String(item.id);


            const colorName =
                item.attributes?.color?.name;


            const size =
                item.attributes?.size;


            if (
                !colorName ||
                size === undefined ||
                size === null
            ) {
                continue;
            }


            // We only want variants that have matching
            // availability information.
            if (
                !availability.has(
                    skuId
                )
            ) {
                continue;
            }


            rows.push({

                color:
                    String(colorName).trim(),

                size:
                    String(size).trim(),

                available:
                    availability.get(
                        skuId
                    )
            });
        }


        if (rows.length === 0) {

            throw new Error(
                "No product variants were found."
            );
        }


        // =====================================================
        // 7. SORT
        //
        // FIRST:
        // Colour alphabetically A → Z
        //
        // SECOND:
        // Size in proper size order
        // =====================================================

        rows.sort((a, b) => {

            // ---------------------------------------------
            // COLOUR
            // ---------------------------------------------

            const colorDifference =
                a.color.localeCompare(
                    b.color,
                    undefined,
                    {
                        sensitivity: "base"
                    }
                );


            if (
                colorDifference !== 0
            ) {
                return colorDifference;
            }


            // ---------------------------------------------
            // SIZE
            // ---------------------------------------------

            const keyA =
                sizeSortKey(
                    a.size
                );


            const keyB =
                sizeSortKey(
                    b.size
                );


            if (
                keyA[0] !== keyB[0]
            ) {

                return (
                    keyA[0] -
                    keyB[0]
                );
            }


            if (
                typeof keyA[1] === "number" &&
                typeof keyB[1] === "number"
            ) {

                return (
                    keyA[1] -
                    keyB[1]
                );
            }


            return String(
                keyA[1]
            ).localeCompare(
                String(
                    keyB[1]
                )
            );
        });


        // =====================================================
        // 8. CREATE EXCEL DATA
        // =====================================================

        const excelData = [

            [
                "컬러",
                "사이즈",
                "옵션가",
                "재고수량",
                "관리코드",
                "사용 여부"
            ]

        ];


        for (const row of rows) {

            excelData.push([

                row.color,

                row.size,

                0,

                row.available
                    ? 5
                    : 0,

                "",

                "Y"

            ]);
        }


        // =====================================================
        // 9. CREATE WORKSHEET
        // =====================================================

        status.textContent =
            "Creating Excel file...";


        const worksheet =
            XLSX.utils.aoa_to_sheet(
                excelData
            );


        // Column widths
        worksheet["!cols"] = [

            {
                wch: 30
            },

            {
                wch: 15
            },

            {
                wch: 12
            },

            {
                wch: 12
            },

            {
                wch: 15
            },

            {
                wch: 12
            }

        ];


        // =====================================================
        // 10. CREATE WORKBOOK
        // =====================================================

        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "옵션"
        );


        // =====================================================
        // 11. PRODUCT TITLE → FILE NAME
        // =====================================================

        let productTitle =
            productData.productTitle ||
            "lululemon product";


        // Remove characters that cannot safely appear
        // in file names.
        productTitle =
            productTitle
                .replace(
                    /[<>:"/\\|?*]/g,
                    ""
                )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        if (!productTitle) {

            productTitle =
                "lululemon product";
        }


        const fileName =
            `${productTitle}.xlsx`;


        // =====================================================
        // 12. DOWNLOAD EXCEL
        // =====================================================

        XLSX.writeFile(
            workbook,
            fileName
        );


        // =====================================================
        // 13. SUCCESS MESSAGE
        // =====================================================

        const colourCount =
            new Set(
                rows.map(
                    row =>
                        row.color
                )
            ).size;


        const variantCount =
            rows.length;


        status.innerHTML = `
            ✅ Excel created!<br><br>
            🎨 ${colourCount} colours<br>
            📦 ${variantCount} variants<br><br>
            <strong>${fileName}</strong>
        `;


    } catch (error) {

        console.error(error);

        status.textContent =
            `❌ ${error.message}`;

    } finally {

        exportButton.disabled = false;

        exportButton.textContent =
            "Export Options";
    }
});