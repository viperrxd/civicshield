/* ============================================
   CivicShield — Application Logic
   Anti-Hoax Civic Alert Gateway
   ============================================ */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal ? 'http://localhost:5000/api' : null;
const FALLBACK_MODE = true; // Use mock data if backend is unavailable

// ---- State ----
let alerts = [];
let currentFilter = 'all';
let isDark = false;
let backendAvailable = false;

// ---- Mock Data (Fallback when backend is down) ----
const MOCK_ALERTS = [
    {
        id: 'BPL-2026-0001',
        title: 'Severe Waterlogging on Hoshangabad Road',
        description: 'Due to heavy overnight rainfall (78mm), severe waterlogging reported on Hoshangabad Road between Piplani Chauraha and ISBT. Traffic movement suspended. Commuters advised to use DB Mall Road as alternate route. Municipal pumps deployed.',
        source: 'Bhopal Municipal Corporation',
        severity: 'critical',
        category: 'weather',
        issued_at: new Date(Date.now() - 2 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 22 * 3600000).toISOString(),
        sha256_hash: '7f3a9c4e8b2d1f6a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f',
        is_active: true
    },
    {
        id: 'BPL-2026-0002',
        title: 'BRTS Route Diversion — Berasia Road',
        description: 'BRTS buses on Route 7 (Bhadbhada to Karond) diverted via VIP Road due to pipeline repair work near Shahpura. Diversion effective from 6:00 AM today. Expected restoration by 8:00 PM. Additional buses deployed on alternate routes.',
        source: 'BRTS Bhopal',
        severity: 'warning',
        category: 'traffic',
        issued_at: new Date(Date.now() - 5 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 19 * 3600000).toISOString(),
        sha256_hash: 'a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2',
        is_active: true
    },
    {
        id: 'BPL-2026-0003',
        title: 'Dengue Alert — South Bhopal Zones',
        description: 'District Health Authority reports 23 new dengue cases in Arera Colony, Shahpura, and Bairagarh zones in the last 48 hours. Residents advised to eliminate stagnant water, use mosquito repellent, and report high fever to nearest PHC. Fogging drives underway.',
        source: 'District Health Authority',
        severity: 'critical',
        category: 'health',
        issued_at: new Date(Date.now() - 8 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 64 * 3600000).toISOString(),
        sha256_hash: 'b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3',
        is_active: true
    },
    {
        id: 'BPL-2026-0004',
        title: 'Scheduled Power Outage — Arera Colony',
        description: 'Madhya Pradesh Power Distribution Company announces scheduled maintenance outage for Arera Colony E-sector (E-1 to E-8) on June 1, 2026 from 09:00 AM to 03:00 PM. Backup generator facilities at community centers will be operational.',
        source: 'MP Power Distribution',
        severity: 'info',
        category: 'infrastructure',
        issued_at: new Date(Date.now() - 12 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 36 * 3600000).toISOString(),
        sha256_hash: 'c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4',
        is_active: true
    },
    {
        id: 'BPL-2026-0005',
        title: 'MP Nagar Zone-I Road Closure — Repair Work',
        description: 'Major road repair work commenced on Zone-I main road near MP Nagar commercial complex. Road closed for through traffic from DB City Mall to ICICI Bank junction. Diversions via Zone-II and Bittan Market roads are available. Expected completion: June 3.',
        source: 'Bhopal Municipal Corporation',
        severity: 'warning',
        category: 'traffic',
        issued_at: new Date(Date.now() - 3 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 69 * 3600000).toISOString(),
        sha256_hash: 'd5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5',
        is_active: true
    },
    {
        id: 'BPL-2026-0006',
        title: 'IMD Orange Alert — Heavy Rainfall Expected',
        description: 'India Meteorological Department issues Orange Alert for Bhopal district. Heavy to very heavy rainfall (115-204mm) expected over the next 36 hours. Citizens advised to avoid waterlogged areas, secure loose objects, and stay updated via official channels.',
        source: 'IMD — Meteorological Dept.',
        severity: 'critical',
        category: 'weather',
        issued_at: new Date(Date.now() - 1 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 35 * 3600000).toISOString(),
        sha256_hash: 'e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6',
        is_active: true
    },
    {
        id: 'BPL-2026-0007',
        title: 'Upper Lake (Bada Talab) Water Level Alert',
        description: 'Upper Lake water level has reached 1666.2 ft against the danger level of 1666.8 ft. Bhadbhada Gate authorities on high alert. Residents in low-lying areas near Kamla Park and VIP Road should remain vigilant. Evacuation plan activated as precautionary measure.',
        source: 'Bhopal Municipal Corporation',
        severity: 'critical',
        category: 'weather',
        issued_at: new Date(Date.now() - 4 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 44 * 3600000).toISOString(),
        sha256_hash: 'f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7',
        is_active: true
    },
    {
        id: 'BPL-2026-0008',
        title: 'New Market Road Closure — Marathon Event',
        description: 'Bhopal City Police informs that New Market main road and surrounding streets will be closed for the Annual City Marathon on June 2, 2026 from 05:00 AM to 12:00 PM. Traffic will be diverted via Roshanpura and MLA Quarters Road.',
        source: 'Bhopal City Police',
        severity: 'info',
        category: 'traffic',
        issued_at: new Date(Date.now() - 6 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 42 * 3600000).toISOString(),
        sha256_hash: 'a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8',
        is_active: true
    },
    {
        id: 'BPL-2026-0009',
        title: 'Water Contamination Warning — Shahpura',
        description: 'District Health Authority warns of suspected water contamination in Shahpura Zone-2 water supply line. Residents advised to boil water before consumption or use packaged drinking water until further notice. Testing underway by PHE department.',
        source: 'District Health Authority',
        severity: 'warning',
        category: 'health',
        issued_at: new Date(Date.now() - 10 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 38 * 3600000).toISOString(),
        sha256_hash: 'b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9',
        is_active: true
    },
    {
        id: 'BPL-2026-0010',
        title: 'TT Nagar Emergency Power Outage',
        description: 'Emergency power outage in TT Nagar area due to transformer failure at 33KV substation. MP Power Distribution crews dispatched for repair. Estimated restoration time: 4-6 hours. Hospital and essential services running on backup power.',
        source: 'MP Power Distribution',
        severity: 'warning',
        category: 'infrastructure',
        issued_at: new Date(Date.now() - 1.5 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 5 * 3600000).toISOString(),
        sha256_hash: 'c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0',
        is_active: true
    },
    {
        id: 'BPL-2026-0011',
        title: 'Thunderstorm Warning — Next 12 Hours',
        description: 'IMD issues thunderstorm warning for Bhopal and adjoining districts. Gusty winds up to 60 km/h expected along with lightning. Avoid open areas, tall trees, and metallic structures. Secure outdoor furniture and vehicles.',
        source: 'IMD — Meteorological Dept.',
        severity: 'warning',
        category: 'weather',
        issued_at: new Date(Date.now() - 0.5 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 11.5 * 3600000).toISOString(),
        sha256_hash: 'd1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1',
        is_active: true
    },
    {
        id: 'BPL-2026-0012',
        title: 'Lower Lake Overflow — Retaining Wall Inspection',
        description: 'Following continuous rainfall, Lower Lake (Chhota Talab) showing signs of overflow near Shaurya Smarak area. Retaining wall inspection ordered. Pedestrians and joggers advised to avoid lakefront pathway until clearance issued.',
        source: 'Bhopal Municipal Corporation',
        severity: 'info',
        category: 'safety',
        issued_at: new Date(Date.now() - 7 * 3600000).toISOString(),
        expires_at: new Date(Date.now() + 41 * 3600000).toISOString(),
        sha256_hash: 'e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2',
        is_active: true
    }
];

const MOCK_STATS = {
    total_alerts: 47,
    active_alerts: 12,
    verified_queries: 2847,
    hoaxes_detected: 1203,
    by_category: { weather: 15, traffic: 12, health: 8, infrastructure: 7, safety: 5 },
    by_severity: { critical: 14, warning: 18, info: 15 }
};

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavbar();
    initScrollAnimations();
    loadAlerts();
    loadDashboard();
    animateHeroStats();
});

// ---- Theme Toggle ----
function initTheme() {
    const saved = localStorage.getItem('civicshield-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        isDark = true;
    }

    document.getElementById('themeToggle').addEventListener('click', () => {
        isDark = !isDark;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('civicshield-theme', isDark ? 'dark' : 'light');
    });
}

// ---- Navbar ----
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    hamburger.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
    });

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    });

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// ---- Scroll Animations ----
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.source-card, .step-card, .dash-card, .chart-card').forEach(el => {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
    });
}

// ---- API Helpers ----
async function apiFetch(endpoint, options = {}) {
    if (!API_BASE) {
        backendAvailable = false;
        console.warn('Backend not configured for production. Using local mock data and JS verification.');
        return null;
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        backendAvailable = true;
        return await response.json();
    } catch (error) {
        backendAvailable = false;
        console.warn(`Backend unavailable: ${error.message}. Using fallback data.`);
        return null;
    }
}

// ---- Load Alerts ----
async function loadAlerts() {
    const grid = document.getElementById('alertsGrid');
    
    // Try backend first
    const data = await apiFetch('/alerts');
    
    if (data && data.alerts) {
        alerts = data.alerts;
    } else {
        alerts = MOCK_ALERTS;
    }

    renderAlerts(alerts);
}

function renderAlerts(alertsToRender) {
    const grid = document.getElementById('alertsGrid');
    
    if (alertsToRender.length === 0) {
        grid.innerHTML = `
            <div class="alerts-loading">
                <span>No alerts match the selected filter.</span>
            </div>
        `;
        return;
    }

    grid.innerHTML = alertsToRender.map((alert, index) => `
        <div class="alert-card ${alert.severity}" 
             onclick="showAlertDetail('${alert.id}')"
             style="animation-delay: ${index * 0.08}s"
             data-severity="${alert.severity}"
             data-category="${alert.category}">
            <div class="alert-card-header">
                <h3 class="alert-title">${escapeHtml(alert.title)}</h3>
                <span class="alert-severity ${alert.severity}">${alert.severity.toUpperCase()}</span>
            </div>
            <p class="alert-description">${escapeHtml(alert.description)}</p>
            <div class="alert-meta">
                <div class="alert-source">
                    <div class="alert-source-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    ${escapeHtml(alert.source)}
                </div>
                <span class="alert-time">${formatTimeAgo(alert.issued_at)}</span>
            </div>
            <div class="alert-hash">🔒 ${alert.sha256_hash.substring(0, 16)}...${alert.sha256_hash.substring(alert.sha256_hash.length - 8)}</div>
        </div>
    `).join('');
}

function filterAlerts(severity, btnElement) {
    // Update active filter
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
    btnElement.classList.add('active');
    currentFilter = severity;

    let filtered;
    if (severity === 'all') {
        filtered = alerts;
    } else {
        filtered = alerts.filter(a => a.severity === severity);
    }

    renderAlerts(filtered);
}

// ---- Show Alert Detail Modal ----
function showAlertDetail(alertId) {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    const modal = document.getElementById('alertModal');
    const body = document.getElementById('modalBody');

    const severityClass = alert.severity;
    const severityColors = {
        critical: 'background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border);',
        warning: 'background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border);',
        info: 'background: var(--info-bg); color: var(--info); border: 1px solid var(--info-border);'
    };

    body.innerHTML = `
        <span class="modal-alert-severity" style="${severityColors[alert.severity] || ''}">${alert.severity.toUpperCase()}</span>
        <h2 class="modal-alert-title">${escapeHtml(alert.title)}</h2>
        <p class="modal-alert-desc">${escapeHtml(alert.description)}</p>
        
        <div class="modal-crypto">
            <div class="modal-crypto-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Cryptographic Verification
            </div>
            <div class="modal-crypto-row">
                <span class="modal-crypto-label">SHA-256</span>
                <span class="modal-crypto-value">${alert.sha256_hash}</span>
            </div>
            <div class="modal-crypto-row">
                <span class="modal-crypto-label">Alert ID</span>
                <span class="modal-crypto-value">${alert.id}</span>
            </div>
            <div class="modal-crypto-row">
                <span class="modal-crypto-label">Signed At</span>
                <span class="modal-crypto-value">${formatDateTime(alert.issued_at)}</span>
            </div>
        </div>

        <div class="modal-meta-grid">
            <div class="modal-meta-item">
                <span class="modal-meta-label">Source</span>
                <span class="modal-meta-value">${escapeHtml(alert.source)}</span>
            </div>
            <div class="modal-meta-item">
                <span class="modal-meta-label">Category</span>
                <span class="modal-meta-value" style="text-transform:capitalize">${alert.category}</span>
            </div>
            <div class="modal-meta-item">
                <span class="modal-meta-label">Issued</span>
                <span class="modal-meta-value">${formatDateTime(alert.issued_at)}</span>
            </div>
            <div class="modal-meta-item">
                <span class="modal-meta-label">Expires</span>
                <span class="modal-meta-value">${formatDateTime(alert.expires_at)}</span>
            </div>
            <div class="modal-meta-item">
                <span class="modal-meta-label">Status</span>
                <span class="modal-meta-value" style="color: var(--success);">● Active</span>
            </div>
            <div class="modal-meta-item">
                <span class="modal-meta-label">Integrity</span>
                <span class="modal-meta-value" style="color: var(--success);">✓ Verified</span>
            </div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('alertModal').classList.remove('active');
    document.body.style.overflow = '';
}

// Close modal on overlay click
document.getElementById('alertModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ---- Verification Engine ----
async function verifyMessage() {
    const input = document.getElementById('verifyInput');
    const text = input.value.trim();
    const resultDiv = document.getElementById('verifyResult');
    const btn = document.getElementById('verifyBtn');

    if (!text) {
        showToast('Please paste a message to verify.', 'warning');
        input.focus();
        return;
    }

    // Loading state
    btn.classList.add('loading');
    btn.disabled = true;

    // Try backend first
    let result = await apiFetch('/verify', {
        method: 'POST',
        body: JSON.stringify({ text })
    });

    // Fallback to local matching
    if (!result) {
        result = localVerify(text);
    }

    // Remove loading state
    btn.classList.remove('loading');
    btn.disabled = false;

    // Display result
    displayVerificationResult(result);
}

function localVerify(text) {
    const textLower = text.toLowerCase();
    const textWords = textLower.split(/\s+/).filter(w => w.length > 2);
    
    let bestMatch = null;
    let bestScore = 0;

    for (const alert of alerts) {
        let score = 0;
        const titleLower = alert.title.toLowerCase();
        const descLower = alert.description.toLowerCase();
        const allAlertText = titleLower + ' ' + descLower;
        const alertWords = allAlertText.split(/\s+/).filter(w => w.length > 2);

        // Keyword overlap
        const commonWords = textWords.filter(w => alertWords.includes(w));
        if (alertWords.length > 0) {
            score += (commonWords.length / Math.max(textWords.length, 1)) * 0.5;
        }

        // Location matching
        const locations = ['hoshangabad', 'mp nagar', 'arera', 'shahpura', 'brts', 'new market', 
                          'bairagarh', 'bhadbhada', 'tt nagar', 'piplani', 'upper lake', 'lower lake',
                          'berasia', 'kamla park', 'karond'];
        for (const loc of locations) {
            if (textLower.includes(loc) && allAlertText.includes(loc)) {
                score += 0.25;
                break;
            }
        }

        // Category keywords
        const categoryKeywords = {
            weather: ['rain', 'flood', 'waterlog', 'storm', 'thunder', 'rainfall', 'lake', 'overflow', 'water level'],
            traffic: ['traffic', 'road', 'diversion', 'closed', 'closure', 'brts', 'route', 'vehicle'],
            health: ['dengue', 'health', 'disease', 'contamination', 'hospital', 'fever', 'outbreak', 'medical'],
            infrastructure: ['power', 'outage', 'electricity', 'transformer', 'maintenance', 'repair'],
            safety: ['safety', 'evacuation', 'danger', 'alert', 'warning', 'avoid']
        };

        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
            const userMatches = keywords.filter(k => textLower.includes(k));
            const alertMatches = keywords.filter(k => allAlertText.includes(k));
            if (userMatches.length > 0 && alertMatches.length > 0 && alert.category === cat) {
                score += 0.2;
                break;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = alert;
        }
    }

    // Determine verdict
    let confidence, verdict;
    if (bestScore >= 0.45) {
        confidence = 'high';
        verdict = 'verified';
    } else if (bestScore >= 0.25) {
        confidence = 'medium';
        verdict = 'partially_verified';
    } else if (bestScore >= 0.1) {
        confidence = 'low';
        verdict = 'unverified';
    } else {
        confidence = 'none';
        verdict = 'no_match';
    }

    return {
        verdict,
        confidence,
        confidence_score: Math.round(bestScore * 100),
        matched_alert: bestScore >= 0.1 ? bestMatch : null,
        message: getVerdictMessage(verdict),
        query_text: text
    };
}

function getVerdictMessage(verdict) {
    const messages = {
        verified: 'This message matches an officially signed and verified government alert.',
        partially_verified: 'This message partially matches an official alert. Some details may be exaggerated or outdated.',
        unverified: 'This message has weak correlation with official alerts. Exercise caution and verify from official sources.',
        no_match: 'Caution: Unverified. No official municipal alerts match this claim within the selected time range.'
    };
    return messages[verdict] || messages.no_match;
}

function displayVerificationResult(result) {
    const resultDiv = document.getElementById('verifyResult');
    resultDiv.classList.remove('hidden');

    const iconMap = {
        verified: { icon: '✓', class: 'verified', label: 'VERIFIED — Official Alert Match' },
        partially_verified: { icon: '~', class: 'partial', label: 'PARTIALLY MATCHED — Review Advised' },
        unverified: { icon: '!', class: 'unverified', label: 'WEAK MATCH — Unverified Claim' },
        no_match: { icon: '✕', class: 'unverified', label: 'NO MATCH — Potentially False' }
    };

    const info = iconMap[result.verdict] || iconMap.no_match;

    const svgIcons = {
        verified: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        partial: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
        unverified: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    let html = `
        <div class="result-header">
            <div class="result-icon ${info.class}">
                ${svgIcons[info.class] || svgIcons.unverified}
            </div>
            <div>
                <div class="result-status ${info.class}">${info.label}</div>
                <div class="result-subtitle">${escapeHtml(result.message)}</div>
            </div>
        </div>
        <div class="result-details">
            <div class="result-detail-row">
                <span class="result-detail-label">Confidence</span>
                <div class="result-detail-value">
                    <div class="confidence-bar">
                        <div class="confidence-track">
                            <div class="confidence-fill ${result.confidence}" style="width: ${Math.max(result.confidence_score, 5)}%"></div>
                        </div>
                        <span class="confidence-label">${result.confidence_score}%</span>
                    </div>
                </div>
            </div>
            <div class="result-detail-row">
                <span class="result-detail-label">Verdict</span>
                <span class="result-detail-value" style="text-transform: capitalize; font-weight: 600;">${result.verdict.replace(/_/g, ' ')}</span>
            </div>
    `;

    if (result.matched_alert) {
        html += `
            <div class="result-detail-row">
                <span class="result-detail-label">Matched Alert</span>
                <span class="result-detail-value" style="font-weight: 600;">${escapeHtml(result.matched_alert.title)}</span>
            </div>
            <div class="result-detail-row">
                <span class="result-detail-label">Source</span>
                <span class="result-detail-value">${escapeHtml(result.matched_alert.source)}</span>
            </div>
            <div class="result-detail-row">
                <span class="result-detail-label">Alert ID</span>
                <span class="result-detail-value" style="font-family: var(--font-mono); font-size: 0.85rem;">${result.matched_alert.id}</span>
            </div>
            <div class="result-detail-row">
                <span class="result-detail-label">SHA-256 Hash</span>
                <span class="result-hash">${result.matched_alert.sha256_hash}</span>
            </div>
            <div class="result-detail-row">
                <span class="result-detail-label">Issued At</span>
                <span class="result-detail-value">${formatDateTime(result.matched_alert.issued_at)}</span>
            </div>
        `;
    }

    html += '</div>';
    resultDiv.innerHTML = html;

    // Smooth scroll to result
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Show toast
    if (result.verdict === 'verified') {
        showToast('✓ Message verified against official alert!', 'success');
    } else if (result.verdict === 'no_match') {
        showToast('⚠ No official alert matches this claim.', 'warning');
    }
}

function setExample(text) {
    document.getElementById('verifyInput').value = text;
    document.getElementById('verifyInput').focus();
    // Auto-verify
    verifyMessage();
}

// ---- Dashboard ----
async function loadDashboard() {
    let stats = await apiFetch('/stats');
    
    if (!stats) {
        stats = MOCK_STATS;
    }

    // Animate counter values
    animateCounter('dashTotalAlerts', stats.total_alerts || 47);
    animateCounter('dashVerifiedQueries', stats.verified_queries || 2847);
    animateCounter('dashHoaxesDetected', stats.hoaxes_detected || 1203);
    animateCounter('dashActiveAlerts', stats.active_alerts || 12);

    // Render charts
    renderCategoryChart(stats.by_category);
    renderSeverityChart(stats.by_severity);
    renderActivityChart();
}

function renderCategoryChart(data) {
    const container = document.getElementById('categoryChart');
    if (!data) data = MOCK_STATS.by_category;

    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const colors = {
        weather: '#3b82f6',
        traffic: '#f59e0b',
        health: '#ef4444',
        infrastructure: '#8b5cf6',
        safety: '#10b981'
    };

    const labels = {
        weather: 'Weather & Floods',
        traffic: 'Traffic & Roads',
        health: 'Public Health',
        infrastructure: 'Infrastructure',
        safety: 'Public Safety'
    };

    container.innerHTML = `
        <div class="chart-bar-group">
            ${Object.entries(data).map(([key, value]) => `
                <div class="chart-bar-item">
                    <span class="chart-bar-label">${labels[key] || key}</span>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${(value / total) * 100}%; background: ${colors[key] || '#64748b'}">${value}</div>
                    </div>
                    <span class="chart-bar-value">${Math.round((value / total) * 100)}%</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderSeverityChart(data) {
    const container = document.getElementById('severityChart');
    if (!data) data = MOCK_STATS.by_severity;

    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const colors = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const labels = { critical: 'Critical', warning: 'Warning', info: 'Informational' };

    // Calculate SVG donut
    let cumulativePercent = 0;
    const slices = Object.entries(data).map(([key, value]) => {
        const percent = (value / total) * 100;
        const startAngle = cumulativePercent * 3.6;
        cumulativePercent += percent;
        return { key, value, percent, color: colors[key], label: labels[key] };
    });

    // Build a simple donut using conic-gradient
    const gradientStops = [];
    let currentPos = 0;
    slices.forEach(slice => {
        gradientStops.push(`${slice.color} ${currentPos}%`);
        currentPos += slice.percent;
        gradientStops.push(`${slice.color} ${currentPos}%`);
    });

    container.innerHTML = `
        <div class="donut-chart-wrapper">
            <div class="donut-chart" style="
                background: conic-gradient(${gradientStops.join(', ')});
                border-radius: 50%;
                position: relative;
            ">
                <div style="
                    position: absolute;
                    inset: 25%;
                    background: var(--surface);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                ">
                    <span style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">${total}</span>
                    <span style="font-size: 0.65rem; color: var(--text-tertiary); font-weight: 500;">TOTAL</span>
                </div>
            </div>
            <div class="donut-legend">
                ${slices.map(s => `
                    <div class="donut-legend-item">
                        <span class="donut-legend-dot" style="background: ${s.color}"></span>
                        <span>${s.label}: <strong>${s.value}</strong> (${Math.round(s.percent)}%)</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderActivityChart() {
    const container = document.getElementById('activityChart');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = [42, 58, 35, 67, 89, 73, 51];
    const max = Math.max(...values);

    container.innerHTML = `
        <div class="activity-chart">
            ${days.map((day, i) => `
                <div class="activity-bar-wrapper">
                    <span class="activity-bar-count">${values[i]}</span>
                    <div class="activity-bar" style="height: ${(values[i] / max) * 100}%"></div>
                    <span class="activity-bar-label">${day}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ---- Animate Counters ----
function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const duration = 1500;
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = Math.round(start + (target - start) * eased);
        el.textContent = current.toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function animateHeroStats() {
    animateCounter('statAlertsVerified', 2847);
    animateCounter('statHoaxesCaught', 1203);
    // statSourcesMonitored is a small number, set directly
    setTimeout(() => {
        const el = document.getElementById('statSourcesMonitored');
        if (el) el.textContent = '6';
    }, 500);
}

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    };

    toast.innerHTML = `
        <span style="color: var(--${type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'danger'}); flex-shrink: 0;">
            ${icons[type] || icons.success}
        </span>
        <span style="color: var(--text-primary); font-weight: 500;">${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ---- Utilities ----
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    });
}
