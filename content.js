/**
 * Global state for user preferences
 */
let settings = {
    highlightFirst: false,
    highlightLast: false,
    showOnlyHighlighted: false
};

/**
 * Entry point: Loads persistent settings and initializes UI/Logic
 */
async function init() {
    const saved = await chrome.storage.sync.get(['scholarSettings']);
    if (saved.scholarSettings) settings = saved.scholarSettings;
    injectUI();
    processPapers();
    setupObserver();
}

/**
 * Injects the control panel into the Google Scholar sidebar
 */
function injectUI() {
    const sidebar = document.getElementById('gsc_rsb_cit');
    if (!sidebar || document.getElementById('scholar-helper-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'scholar-helper-panel';
    panel.innerHTML = `
        <div class="helper-row">
            <span class="helper-tag">Highlight</span>
            <label class="helper-option"><input type="checkbox" id="check-first" ${settings.highlightFirst ? 'checked' : ''}> First Author</label>
            <label class="helper-option"><input type="checkbox" id="check-last" ${settings.highlightLast ? 'checked' : ''}> Last Author</label>
        </div>
        <div class="helper-row">
            <span class="helper-tag">Filter</span>
            <label class="helper-option"><input type="checkbox" id="check-only" ${settings.showOnlyHighlighted ? 'checked' : ''}> Show only highlighted</label>
        </div>
    `;

    sidebar.parentNode.insertBefore(panel, sidebar);

    // Bind events and persist changes to storage
    ['first', 'last', 'only'].forEach(id => {
        document.getElementById(`check-${id}`).addEventListener('change', (e) => {
            if (id === 'first') settings.highlightFirst = e.target.checked;
            if (id === 'last') settings.highlightLast = e.target.checked;
            if (id === 'only') settings.showOnlyHighlighted = e.target.checked;

            chrome.storage.sync.set({ scholarSettings: settings });
            processPapers(true);
        });
    });
}

/**
 * Main logic for author identification and DOM manipulation
 * @param {boolean} forceRefresh - If true, clears previous processing data
 */
function processPapers(forceRefresh = false) {
    const profileNameElement = document.getElementById('gsc_prf_in');
    if (!profileNameElement) return;

    // Generate matching patterns from profile name
    const fullName = profileNameElement.innerText.trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0], lastName = parts[parts.length - 1];
    const fInit = firstName[0], lInit = lastName[0];

    // Regex handles: Standard (First Last, F Last), Inverted (Last First, L First), 
    // and Inverted Initial. \b prevents partial matches (e.g., "J Doe" vs "J Doel").
    const pattern = `\\b(` +
        `${firstName}\\s${lastName}|` +
        `${fInit}\\.?\\s?\\w?\\.?\\s?${lastName}|` +
        `${lastName}\\s${firstName}|` +
        `${lInit}\\.?\\s?\\w?\\.?\\s?${firstName}` +
        `)\\b`;
    const nameRegex = new RegExp(pattern, 'gi');

    document.querySelectorAll('.gsc_a_tr').forEach(row => {
        const authorCell = row.querySelector('.gsc_a_at + .gs_gray');
        if (!authorCell) return;

        if (forceRefresh) {
            row.classList.remove('row-first-author', 'row-last-author', 'gs_hidden_row');
            authorCell.innerHTML = authorCell.innerText;
            row.removeAttribute('data-processed');
        }

        if (row.getAttribute('data-processed') === 'true') return;

        const authorText = authorCell.innerText;
        const authorsArray = authorText.split(',').map(s => s.trim());

        // Reset regex index for each row to handle the global flag correctly
        nameRegex.lastIndex = 0;
        const nameVisible = nameRegex.test(authorText);

        // Check if user is First Author
        nameRegex.lastIndex = 0;
        const isFirst = authorsArray.length > 0 && nameRegex.test(authorsArray[0]);

        // Check if user is Last Author (or hidden within the ellipsis)
        const lastInList = authorsArray[authorsArray.length - 1];
        nameRegex.lastIndex = 0;
        const isLast = !isFirst && (nameRegex.test(lastInList) || (lastInList.includes('...') && !nameVisible));

        // Highlight name or ellipsis
        nameRegex.lastIndex = 0;
        if (nameVisible) {
            authorCell.innerHTML = authorCell.innerHTML.replace(nameRegex, match => `<span class="author-highlight">${match}</span>`);
        } else if (authorText.includes('...')) {
            authorCell.innerHTML = authorCell.innerHTML.replace('...', `<span class="author-highlight">...</span>`);
        }

        // Apply row highlights
        if (settings.highlightFirst && isFirst) row.classList.add('row-first-author');
        if (settings.highlightLast && isLast) row.classList.add('row-last-author');

        // Apply visibility filter
        if (settings.showOnlyHighlighted) {
            const matchesActiveCriteria = (settings.highlightFirst && isFirst) || (settings.highlightLast && isLast);
            if (!matchesActiveCriteria) row.classList.add('gs_hidden_row');
        }

        row.setAttribute('data-processed', 'true');
    });
}

/**
 * Observes the table for changes (e.g., clicking "Show More") to process new papers
 */
function setupObserver() {
    const tableBody = document.getElementById('gsc_a_b');
    if (tableBody) {
        new MutationObserver(() => processPapers()).observe(tableBody, { childList: true });
    }
}

init();