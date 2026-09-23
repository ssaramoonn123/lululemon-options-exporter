async function extractLululemonProduct() {

    // =====================================================
    // HELPERS
    // =====================================================

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));


    // =====================================================
    // PRODUCT TITLE
    // =====================================================

    function getProductTitle() {

        const h1 = document.querySelector("h1");

        if (h1?.textContent.trim()) {
            return h1.textContent.trim();
        }

        const meta = document.querySelector(
            'meta[property="og:title"]'
        );

        if (meta?.content?.trim()) {
            return meta.content.trim();
        }

        return "lululemon product";
    }


    // =====================================================
    // FIND THE MAIN SIZE SELECTOR
    // =====================================================

    function getSizeGroup() {

        const groups = [
            ...document.querySelectorAll(
                '[role="radiogroup"]'
            )
        ];


        // Prefer a radiogroup explicitly named Size
        // or Select Size.
        const explicitGroup =
            groups.find(group => {

                const aria =
                    (
                        group.getAttribute(
                            "aria-label"
                        ) || ""
                    )
                    .trim()
                    .toLowerCase();

                return (
                    aria === "size" ||
                    aria === "select size"
                );
            });


        if (explicitGroup) {
            return explicitGroup;
        }


        // Fallback:
        // find the group containing Lululemon size tiles.
        const tileGroup =
            groups.find(group =>
                group.querySelector(
                    '[data-lll-pl="size-tile-zest"]'
                )
            );


        if (tileGroup) {
            return tileGroup;
        }


        return null;
    }


    // =====================================================
    // READ THE SIZES THE CUSTOMER ACTUALLY SEES
    //
    // IMPORTANT:
    //
    // Do NOT use:
    //
    // data-lll-component-name="pdp:size_selector:2"
    //
    // because "2" is not necessarily the displayed size.
    //
    // Instead read the visible text:
    //
    // XXS XS S M L XL
    //
    // or:
    //
    // 0 2 4 6 8 10 12 14 16 18 20
    // =====================================================

    function readCurrentSizes() {

        const group = getSizeGroup();

        if (!group) {
            return [];
        }


        const sizes = new Set();


        // -------------------------------------------------
        // PRIMARY METHOD
        //
        // Read visible text from Lululemon's size tiles.
        // -------------------------------------------------

        const tiles = [
            ...group.querySelectorAll(
                '[data-lll-pl="size-tile-zest"]'
            )
        ];


        for (const tile of tiles) {

            const visibleText =
                tile.textContent
                    .replace(/\s+/g, " ")
                    .trim();


            if (!visibleText) {
                continue;
            }


            // Numeric sizes
            if (/^\d+$/.test(visibleText)) {

                sizes.add(
                    visibleText
                );

                continue;
            }


            // Letter sizes
            if (
                /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)$/i
                    .test(visibleText)
            ) {

                sizes.add(
                    visibleText.toUpperCase()
                );

                continue;
            }


            // One Size
            if (
                /^ONE\s*SIZE$/i.test(
                    visibleText
                )
            ) {

                sizes.add(
                    "ONE SIZE"
                );
            }
        }


        // -------------------------------------------------
        // FALLBACK
        //
        // If the size-tile attribute changes on another PDP,
        // inspect labels/buttons inside the main size group.
        // -------------------------------------------------

        if (sizes.size === 0) {

            const candidates = [
                ...group.querySelectorAll(
                    "label, button"
                )
            ];


            for (const element of candidates) {

                const text =
                    element.textContent
                        .replace(/\s+/g, " ")
                        .trim();


                if (!text) {
                    continue;
                }


                if (/^\d+$/.test(text)) {

                    sizes.add(text);

                    continue;
                }


                if (
                    /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)$/i
                        .test(text)
                ) {

                    sizes.add(
                        text.toUpperCase()
                    );

                    continue;
                }


                if (
                    /^ONE\s*SIZE$/i.test(text)
                ) {

                    sizes.add(
                        "ONE SIZE"
                    );
                }
            }
        }


        return [...sizes];
    }


    // =====================================================
    // COLOUR HELPERS
    // =====================================================

    function getColourInputs(container) {

        return [
            ...container.querySelectorAll(
                'input[type="radio"]'
            )
        ].filter(input => {

            const id =
                String(
                    input.value || ""
                );


            const name =
                input.getAttribute(
                    "aria-label"
                );


            return (
                /^\d+$/.test(id) &&
                Boolean(name)
            );
        });
    }


    function findColourInput(
        container,
        colorId
    ) {

        return getColourInputs(
            container
        ).find(
            input =>
                String(input.value) ===
                String(colorId)
        );
    }


    function clickColour(input) {

        let clickable =
            input.closest("label");


        if (
            !clickable &&
            input.id
        ) {

            clickable =
                document.querySelector(
                    `label[for="${CSS.escape(
                        input.id
                    )}"]`
                );
        }


        if (clickable) {

            clickable.click();

        } else {

            input.click();
        }
    }


    // =====================================================
    // CURRENT URL COLOUR
    // =====================================================

    function getURLColor() {

        try {

            return new URL(
                location.href
            ).searchParams.get(
                "color"
            );

        } catch {

            return null;
        }
    }


    // =====================================================
    // WAIT FOR COLOUR + SIZE UI
    // =====================================================

    async function waitForColourUI(
        container,
        colorId
    ) {

        const timeout = 2500;

        const start =
            performance.now();


        // -------------------------------------------------
        // Wait until the colour actually becomes selected.
        // -------------------------------------------------

        while (
            performance.now() - start <
            timeout
        ) {

            const input =
                findColourInput(
                    container,
                    colorId
                );


            const urlColor =
                getURLColor();


            if (
                input &&
                input.checked &&
                (
                    !urlColor ||
                    String(urlColor) ===
                        String(colorId)
                )
            ) {
                break;
            }


            await sleep(30);
        }


        // -------------------------------------------------
        // Wait until visible size buttons stop changing.
        // -------------------------------------------------

        let previousSnapshot = null;

        let stableCount = 0;

        const stabilityStart =
            performance.now();


        while (
            performance.now() -
            stabilityStart <
            1800
        ) {

            await sleep(80);


            const snapshot =
                readCurrentSizes()
                    .join("|");


            if (
                snapshot &&
                snapshot ===
                    previousSnapshot
            ) {

                stableCount++;

            } else {

                previousSnapshot =
                    snapshot;

                stableCount = 0;
            }


            // ~320ms with the same size list
            if (stableCount >= 4) {
                return;
            }
        }


        await sleep(100);
    }


    // =====================================================
    // FETCH JSON
    // =====================================================

    async function fetchJSON(url) {

        const response =
            await fetch(
                url,
                {
                    headers: {

                        "accept":
                            "application/vnd.api+json",

                        "x-lll-client":
                            "product-sdk",

                        "x-lll-locale":
                            "en-ca"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                `Request failed: ${response.status}`
            );
        }


        return await response.json();
    }


    // =====================================================
    // 1. PRODUCT ID
    // =====================================================

    const parts =
        location.pathname
            .split("/")
            .filter(Boolean);


    const underscoreIndex =
        parts.indexOf("_");


    const productId =
        underscoreIndex !== -1 &&
        parts[underscoreIndex + 1]

            ? parts[underscoreIndex + 1]

            : parts[parts.length - 1];


    if (!productId) {

        throw new Error(
            "Could not find product ID."
        );
    }


    const productTitle =
        getProductTitle();


    // =====================================================
    // 2. FIND COLOUR SELECTOR
    // =====================================================

    const textElements = [
        ...document.querySelectorAll(
            "span, p, div, legend, label, h2, h3"
        )
    ];


    const colourLabel =
        textElements.find(
            element =>
                element.textContent
                    .trim() ===
                "Colour"
        );


    if (!colourLabel) {

        throw new Error(
            "Could not find Colour selector."
        );
    }


    let colourContainer =
        colourLabel.parentElement;


    while (
        colourContainer &&
        colourContainer !== document.body
    ) {

        const inputs =
            getColourInputs(
                colourContainer
            );


        if (inputs.length >= 2) {
            break;
        }


        colourContainer =
            colourContainer.parentElement;
    }


    if (
        !colourContainer ||
        colourContainer ===
            document.body
    ) {

        throw new Error(
            "Could not isolate Colour selector."
        );
    }


    // =====================================================
    // 3. CURRENT COLOURS
    // =====================================================

    const initialInputs =
        getColourInputs(
            colourContainer
        );


    const currentColors =
        new Map();


    for (const input of initialInputs) {

        const id =
            String(
                input.value
            );


        const name =
            input
                .getAttribute(
                    "aria-label"
                )
                ?.trim();


        if (
            !id ||
            !name
        ) {
            continue;
        }


        currentColors.set(
            id,
            name
        );
    }


    if (
        currentColors.size === 0
    ) {

        throw new Error(
            "No current colours were found."
        );
    }


    // =====================================================
    // 4. REMEMBER ORIGINAL COLOUR
    // =====================================================

    const originalSelected =
        initialInputs.find(
            input =>
                input.checked
        );


    const originalColorId =
        originalSelected

            ? String(
                originalSelected.value
            )

            : getURLColor();


    // =====================================================
    // 5. READ VISIBLE SIZES FOR EVERY COLOUR
    // =====================================================

    const sizesByColor =
        new Map();


    for (
        const [colorId, colorName]
        of currentColors.entries()
    ) {

        const input =
            findColourInput(
                colourContainer,
                colorId
            );


        if (!input) {

            throw new Error(
                `Could not select ${colorName}.`
            );
        }


        const currentURLColor =
            getURLColor();


        // -------------------------------------------------
        // SWITCH TO THIS COLOUR
        // -------------------------------------------------

        if (
            !input.checked ||
            (
                currentURLColor &&
                String(currentURLColor) !==
                    String(colorId)
            )
        ) {

            clickColour(input);


            await waitForColourUI(
                colourContainer,
                colorId
            );

        } else {

            await sleep(250);
        }


        // -------------------------------------------------
        // READ EXACTLY THE SIZES DISPLAYED FOR THIS COLOUR
        // -------------------------------------------------

        const sizes =
            readCurrentSizes();


        if (sizes.length === 0) {

            throw new Error(
                `No visible sizes found for ${colorName}.`
            );
        }


        sizesByColor.set(
            colorId,
            new Set(sizes)
        );
    }


    // =====================================================
    // 6. RESTORE ORIGINAL COLOUR
    // =====================================================

    if (originalColorId) {

        const input =
            findColourInput(
                colourContainer,
                originalColorId
            );


        if (
            input &&
            !input.checked
        ) {

            clickColour(input);


            await waitForColourUI(
                colourContainer,
                originalColorId
            );
        }
    }


    // =====================================================
    // 7. GET AVAILABILITY
    // =====================================================

    const fullAvailability =
        await fetchJSON(
            `/.uf-svc/v1/products/${productId}/skus/availability?fulfillment=ship`
        );


    if (
        !Array.isArray(
            fullAvailability.data
        )
    ) {

        throw new Error(
            "Invalid availability response."
        );
    }


    const allSkuIds =
        fullAvailability.data.map(
            item =>
                String(item.id)
        );


    if (allSkuIds.length === 0) {

        throw new Error(
            "No SKUs were returned."
        );
    }


    // =====================================================
    // 8. SPLIT SKU IDS INTO GROUPS OF 20
    // =====================================================

    const chunks = [];


    for (
        let i = 0;
        i < allSkuIds.length;
        i += 20
    ) {

        chunks.push(
            allSkuIds.slice(
                i,
                i + 20
            )
        );
    }


    // =====================================================
    // 9. FETCH SKU DETAILS
    //
    // Run four requests at once to reduce waiting time.
    // =====================================================

    const allSkuDetails = [];

    const concurrency = 4;


    for (
        let i = 0;
        i < chunks.length;
        i += concurrency
    ) {

        const batch =
            chunks.slice(
                i,
                i + concurrency
            );


        const responses =
            await Promise.all(
                batch.map(
                    chunk =>
                        fetchJSON(
                            `/.uf-svc/v1/skus?skuIds=${chunk.join(",")}`
                        )
                )
            );


        for (const json of responses) {

            if (
                Array.isArray(
                    json.data
                )
            ) {

                allSkuDetails.push(
                    ...json.data
                );
            }
        }
    }


    // =====================================================
    // 10. FILTER TO CURRENT UI OPTIONS
    //
    // Keep a SKU ONLY when:
    //
    // 1. Its colour exists on the current page.
    //
    // 2. Its size is ACTUALLY DISPLAYED in the size selector
    //    when that colour is selected.
    //
    // This prevents historical sizes such as XXXS or 20
    // from appearing when the customer cannot see them.
    // =====================================================

    const filteredSkuDetails =
        allSkuDetails.filter(
            item => {

                const colorId =
                    String(
                        item.attributes
                            ?.color
                            ?.id ?? ""
                    );


                let size =
                    String(
                        item.attributes
                            ?.size ?? ""
                    ).trim();


                // Normalize letter sizes
                if (
                    /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)$/i
                        .test(size)
                ) {

                    size =
                        size.toUpperCase();
                }


                if (
                    /^ONE\s*SIZE$/i.test(size)
                ) {

                    size =
                        "ONE SIZE";
                }


                // -----------------------------------------
                // COLOUR MUST BE ON CURRENT PAGE
                // -----------------------------------------

                if (
                    !currentColors.has(
                        colorId
                    )
                ) {
                    return false;
                }


                // -----------------------------------------
                // GET SIZES ACTUALLY SHOWN FOR THIS COLOUR
                // -----------------------------------------

                const visibleSizes =
                    sizesByColor.get(
                        colorId
                    );


                if (!visibleSizes) {
                    return false;
                }


                // -----------------------------------------
                // SIZE MUST BE VISIBLE IN UI
                // -----------------------------------------

                return visibleSizes.has(
                    size
                );
            }
        );


    // =====================================================
    // 11. REMOVE DUPLICATE SKU IDS
    // =====================================================

    const uniqueSkuDetails = [];

    const seenSkuIds =
        new Set();


    for (
        const item of filteredSkuDetails
    ) {

        const skuId =
            String(
                item.id
            );


        if (
            seenSkuIds.has(
                skuId
            )
        ) {
            continue;
        }


        seenSkuIds.add(
            skuId
        );


        uniqueSkuDetails.push(
            item
        );
    }


    // =====================================================
    // 12. MATCH AVAILABILITY
    // =====================================================

    const finalSkuIds =
        new Set(
            uniqueSkuDetails.map(
                item =>
                    String(item.id)
            )
        );


    const finalAvailability = {

        ...fullAvailability,


        data:
            fullAvailability.data.filter(
                item =>
                    finalSkuIds.has(
                        String(item.id)
                    )
            )
    };


    // =====================================================
    // 13. RETURN DATA TO POPUP
    // =====================================================

    return {

        productId,

        productTitle,

        productURL:
            location.href,

        capturedAt:
            new Date().toISOString(),


        currentColors:
            [...currentColors.entries()]
                .map(
                    ([id, name]) => ({
                        id,
                        name
                    })
                ),


        sizesByColor:
            [...sizesByColor.entries()]
                .map(
                    ([colorId, sizes]) => ({

                        colorId,

                        colorName:
                            currentColors.get(
                                colorId
                            ),

                        sizes:
                            [...sizes]
                    })
                ),


        availability:
            finalAvailability,


        skuResponses: [
            {
                data:
                    uniqueSkuDetails
            }
        ]
    };
}