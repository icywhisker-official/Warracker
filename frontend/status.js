// DOM Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const darkModeToggle = document.getElementById('darkModeToggle');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorContainer = document.getElementById('errorContainer');
const errorMessage = document.getElementById('errorMessage');
const errorDetails = document.getElementById('errorDetails');
const dashboardContent = document.getElementById('dashboardContent');
const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
const searchWarranties = document.getElementById('searchWarranties');
const statusFilter = document.getElementById('statusFilter');
const sortableHeaders = document.querySelectorAll('.sortable');
const exportBtn = document.getElementById('exportBtn');

// Configuration
const API_BASE_URL = '/api/statistics'; // Base URL for statistics endpoint
const API_URL = window.location.origin + API_BASE_URL; // Full URL for statistics endpoint
let EXPIRING_SOON_DAYS = 30; // Default value, will be updated from user preferences

// Global variables for sorting and filtering
let currentSort = { column: 'expiration', direction: 'asc' };
let allWarranties = []; // Store all warranties for filtering/sorting

// Global variables for chart instances and data
let statusChart = null;
let timelineChart = null;
let currentStatusData = null; // To store data for redraws
let currentTimelineData = null; // To store data for redraws

// Theme Management - Simplified
function setTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    console.log('Setting theme to:', theme, 'from status.js');

    // 1. Apply theme attribute to document root
    document.documentElement.setAttribute('data-theme', theme);
    
    // 2. Save the single source of truth to localStorage
    localStorage.setItem('darkMode', isDark);

    // Update toggle state if the toggle exists on this page
    if (darkModeToggle) { 
        darkModeToggle.checked = isDark;
    }
}

// Function to redraw charts after theme change
function redrawChartsWithNewTheme() {
    console.log("Theme changed, redrawing charts...");
    // Destroy existing charts if they exist - USE CORRECT VARIABLE NAMES
    if (statusChart && typeof statusChart.destroy === 'function') {
        statusChart.destroy(); 
        statusChart = null; // Reset variable
    }
    if (timelineChart && typeof timelineChart.destroy === 'function') {
        timelineChart.destroy(); 
        timelineChart = null; // Reset variable
    }
    // Re-create charts with current data which will use new theme colors
    if (currentStatusData) {
        createStatusChart(currentStatusData);
    }
    if (currentTimelineData) {
        createTimelineChart(currentTimelineData);
    }
}

// Loading indicator functions
function showLoading() {
    if (loadingIndicator) {
        loadingIndicator.classList.add('active');
        dashboardContent.style.opacity = '0.5';
    }
}

function hideLoading() {
    if (loadingIndicator) {
        loadingIndicator.classList.remove('active');
        dashboardContent.style.opacity = '1';
    }
}

// Show error message
function showError(message, details = '') {
    errorMessage.textContent = message;
    errorDetails.textContent = details;
    errorContainer.style.display = 'block';
    dashboardContent.style.display = 'none';
}

// Hide error message
function hideError() {
    errorContainer.style.display = 'none';
    dashboardContent.style.display = 'block';
}

// Fetch statistics from API
async function fetchStatistics() {
    try {
        console.log('Checking authentication status...');
        console.log('window.auth exists:', !!window.auth);
        
        // Check if auth is available and user is authenticated
        if (!window.auth) {
            console.error('Auth object not available. Make sure auth.js is loaded before status.js');
            throw new Error('Authentication system not available. Please refresh the page.');
        }
        
        console.log('User is authenticated:', window.auth.isAuthenticated());
        if (!window.auth.isAuthenticated()) {
            throw new Error('Authentication required. Please log in to view statistics.');
        }
        
        // Get the auth token
        const token = window.auth.getToken();
        console.log('Auth token available:', !!token);
        if (!token) {
            throw new Error('Authentication token not available. Please log in again.');
        }
        
        // Create request with auth header
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        
        console.log('Fetching statistics from:', API_URL);
        const response = await fetch(API_URL, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch statistics: ${response.status} ${errorText}`);
        }
        
        // Parse JSON only once
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching statistics:', error);
        throw error;
    }
}

// Show a toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        ${message}
        <button class="toast-close">&times;</button>
    `;
    
    // Add close event
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 3000);
}

// Update the summary counts
function updateSummaryCounts(statusData) {
    // Check if the elements exist before trying to set textContent
    const totalEl = document.getElementById('totalCount');
    const activeEl = document.getElementById('activeCount');
    const expiringEl = document.getElementById('expiringCount');
    const expiredEl = document.getElementById('expiredCount');

    if (totalEl) totalEl.textContent = statusData.total || 0;
    if (activeEl) activeEl.textContent = statusData.active || 0;
    if (expiringEl) expiringEl.textContent = statusData.expiring_soon || 0;
    if (expiredEl) expiredEl.textContent = statusData.expired || 0;
}

// Create the status distribution chart
function createStatusChart(stats) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    // Ensure we have valid stats
    if (!stats || typeof stats !== 'object') {
        console.error('Invalid stats data:', stats);
        stats = { active: 0, expiring_soon: 0, expired: 0, total: 0 };
    }
    
    // Set default values for missing properties
    const active = stats.active || 0;
    const expiringSoon = stats.expiring_soon || 0;
    const expired = stats.expired || 0;
    
    // Calculate truly active (not expiring soon)
    const trulyActive = Math.max(0, active - expiringSoon);
    
    // Destroy existing chart if it exists - USE CORRECT VARIABLE NAME
    if (statusChart && typeof statusChart.destroy === 'function') {
        statusChart.destroy();
    }
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Expiring Soon', 'Expired'],
            datasets: [{
                data: [
                    trulyActive,
                    expiringSoon,
                    expired
                ],
                backgroundColor: [
                    '#4CAF50', // Green for active
                    '#FF9800', // Orange for expiring soon
                    '#F44336'  // Red for expired
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Create the timeline chart
function createTimelineChart(timeline) {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    // Ensure timeline is an array
    if (!Array.isArray(timeline)) {
        console.error('Timeline data is not an array:', timeline);
        timeline = [];
    }
    
    // Format labels as "Month Year"
    const formattedLabels = timeline.map(item => {
        try {
            // Handle different possible formats
            let year, month;
            
            if (item.year !== undefined && item.month !== undefined) {
                year = item.year;
                month = item.month - 1; // JavaScript months are 0-indexed
            } else if (item.date) {
                const date = new Date(item.date);
                year = date.getFullYear();
                month = date.getMonth();
            } else {
                // Default to current month if data format is unknown
                const date = new Date();
                year = date.getFullYear();
                month = date.getMonth();
            }
            
            const date = new Date(year, month, 1);
            return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        } catch (error) {
            console.error('Error formatting timeline label:', error);
            return 'Unknown';
        }
    });
    
    // Get count values, defaulting to 0 if not present
    const counts = timeline.map(item => {
        return item.count !== undefined ? item.count : 0;
    });
    
    // If we have no data, create a default dataset
    if (timeline.length === 0) {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        
        // Create labels for the last 3 months
        for (let i = 2; i >= 0; i--) {
            const date = new Date(currentYear, currentMonth - i, 1);
            formattedLabels.push(date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
            counts.push(0);
        }
    }
    
    // Destroy existing chart if it exists - USE CORRECT VARIABLE NAME
    if (timelineChart && typeof timelineChart.destroy === 'function') {
        timelineChart.destroy();
    }
    
    timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Warranties Expiring',
                data: counts,
                backgroundColor: '#3498db',
                borderColor: '#2980b9',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0 // Only show integer values
                    }
                }
            }
        }
    });
}

// Update the recent expirations table
function updateRecentExpirations(recentWarranties) {
    // Ensure we have an array
    if (!Array.isArray(recentWarranties)) {
        console.error('Recent warranties data is not an array:', recentWarranties);
        recentWarranties = [];
    }
    
    // Normalize the data format
    const normalizedWarranties = recentWarranties.map(warranty => {
        // Create a standardized warranty object
        return {
            id: warranty.id || Math.random().toString(36).substr(2, 9), // Generate ID if not present
            product_name: warranty.product_name || warranty.name || 'Unknown Product',
            purchase_date: warranty.purchase_date || new Date().toISOString().split('T')[0],
            expiration_date: warranty.expiration_date || new Date().toISOString().split('T')[0],
            invoice_path: warranty.invoice_path || null
        };
    });
    
    // Apply initial filtering and sorting
    filterAndSortWarranties();
}

// Filter and sort warranties based on current settings
function filterAndSortWarranties() {
    const searchTerm = searchWarranties.value.toLowerCase();
    const statusValue = statusFilter.value;
    const tableBody = document.getElementById('recentExpirationsBody');
    
    // Clear the table
    tableBody.innerHTML = '';
    
    if (!allWarranties || allWarranties.length === 0) {
        // Create a full-width, centered overlay message instead of using table structure
        const tableContainer = document.querySelector('.table-responsive');
        const emptyMessage = document.createElement('div');
        
        // Apply styles directly to ensure centering
        emptyMessage.style.position = 'absolute';
        emptyMessage.style.top = '0';
        emptyMessage.style.left = '0';
        emptyMessage.style.width = '100%';
        emptyMessage.style.height = '300px';
        emptyMessage.style.display = 'flex';
        emptyMessage.style.justifyContent = 'center';
        emptyMessage.style.alignItems = 'center';
        emptyMessage.style.fontSize = '1.2em';
        emptyMessage.style.color = 'var(--text-color)';
        emptyMessage.style.backgroundColor = 'var(--card-bg)';
        emptyMessage.style.zIndex = '1'; // Ensure it's on top
        
        // Add the message text
        emptyMessage.textContent = 'No recently expired or expiring warranties.';
        
        // Make sure table container has position relative
        tableContainer.style.position = 'relative';
        
        // Clear any existing error messages
        const existingMessages = tableContainer.querySelectorAll('.empty-message-overlay');
        existingMessages.forEach(msg => msg.remove());
        
        // Add class for easier removal later
        emptyMessage.classList.add('empty-message-overlay');
        
        // Add to the table container
        tableContainer.appendChild(emptyMessage);
        
        // Add a blank row to maintain table structure
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="height: 300px;"></td>';
        tableBody.appendChild(row);
        
        return;
    }
    
    const today = new Date();
    
    // Filter warranties
    let filteredWarranties = allWarranties.filter(warranty => {
        // Skip warranties without proper dates
        if (!warranty.expiration_date) return false;
        
        // Apply search filter
        const productName = (warranty.product_name || '').toLowerCase();
        const matchesSearch = searchTerm === '' || productName.includes(searchTerm);
        
        // Apply status filter
        if (statusValue === 'all') {
            return matchesSearch;
        }
        
        const expirationDate = new Date(warranty.expiration_date);
        
        if (statusValue === 'expired') {
            return expirationDate <= today && matchesSearch;
        } else if (statusValue === 'expiring') {
            const timeDiff = expirationDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            return expirationDate > today && daysDiff <= EXPIRING_SOON_DAYS && matchesSearch;
        } else if (statusValue === 'active') {
            const timeDiff = expirationDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            return expirationDate > today && daysDiff > EXPIRING_SOON_DAYS && matchesSearch;
        }
        
        return matchesSearch;
    });
    
    // Sort warranties
    filteredWarranties.sort((a, b) => {
        let valueA, valueB;
        
        switch (currentSort.column) {
            case 'product':
                valueA = a.product_name || '';
                valueB = b.product_name || '';
                break;
            case 'purchase':
                valueA = new Date(a.purchase_date || 0);
                valueB = new Date(b.purchase_date || 0);
                break;
            case 'expiration':
                valueA = new Date(a.expiration_date || 0);
                valueB = new Date(b.expiration_date || 0);
                break;
            case 'status':
                // Sort by status priority: active, expiring, expired
                const statusA = getStatusPriority(a.expiration_date, today);
                const statusB = getStatusPriority(b.expiration_date, today);
                valueA = statusA;
                valueB = statusB;
                break;
            default:
                valueA = new Date(a.expiration_date || 0);
                valueB = new Date(b.expiration_date || 0);
        }
        
        // Compare values based on sort direction
        if (currentSort.direction === 'asc') {
            if (valueA instanceof Date && valueB instanceof Date) {
                return valueA.getTime() - valueB.getTime();
            } else {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            }
        } else {
            if (valueA instanceof Date && valueB instanceof Date) {
                return valueB.getTime() - valueA.getTime();
            } else {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
            }
        }
    });
    
    // Render filtered and sorted warranties
    if (filteredWarranties.length === 0) {
        // Create a full-width, centered overlay message instead of using table structure
        const tableContainer = document.querySelector('.table-responsive');
        const emptyMessage = document.createElement('div');
        
        // Apply styles directly to ensure centering
        emptyMessage.style.position = 'absolute';
        emptyMessage.style.top = '0';
        emptyMessage.style.left = '0';
        emptyMessage.style.width = '100%';
        emptyMessage.style.height = '300px';
        emptyMessage.style.display = 'flex';
        emptyMessage.style.justifyContent = 'center';
        emptyMessage.style.alignItems = 'center';
        emptyMessage.style.fontSize = '1.2em';
        emptyMessage.style.color = 'var(--text-color)';
        emptyMessage.style.backgroundColor = 'var(--card-bg)';
        emptyMessage.style.zIndex = '1'; // Ensure it's on top
        
        // Add the message text
        emptyMessage.textContent = 'No warranties match your search criteria.';
        
        // Make sure table container has position relative
        tableContainer.style.position = 'relative';
        
        // Clear any existing error messages
        const existingMessages = tableContainer.querySelectorAll('.empty-message-overlay');
        existingMessages.forEach(msg => msg.remove());
        
        // Add class for easier removal later
        emptyMessage.classList.add('empty-message-overlay');
        
        // Add to the table container
        tableContainer.appendChild(emptyMessage);
        
        // Add a blank row to maintain table structure
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="height: 300px;"></td>';
        tableBody.appendChild(row);
        
        return;
    }
    
    filteredWarranties.forEach(warranty => {
        const row = document.createElement('tr');
        
        // Make sure we have valid data to work with
        if (!warranty.expiration_date) return;
        
        // Determine status
        const expirationDate = new Date(warranty.expiration_date);
        let status = 'active';
        
        if (expirationDate <= today) {
            status = 'expired';
        } else {
            const timeDiff = expirationDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            if (daysDiff <= EXPIRING_SOON_DAYS) {
                status = 'expiring';
            }
        }
        
        row.className = `status-${status}`;
        
        // Format dates
        const purchaseDate = warranty.purchase_date ? new Date(warranty.purchase_date).toLocaleDateString() : 'N/A';
        const formattedExpirationDate = expirationDate.toLocaleDateString();
        
        // Status display
        let statusText = status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring Soon' : 'Active';
        let statusClass = `status-${status}`;
        
        // Create table cells with proper structure
        row.innerHTML = `
            <td>${warranty.product_name || 'Unknown Product'}</td>
            <td>${purchaseDate}</td>
            <td>${formattedExpirationDate}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Get status priority for sorting (1: active, 2: expiring, 3: expired)
function getStatusPriority(expirationDateStr, today) {
    const expirationDate = new Date(expirationDateStr);
    
    if (expirationDate <= today) {
        return 3; // Expired
    } else {
        const timeDiff = expirationDate - today;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= EXPIRING_SOON_DAYS) {
            return 2; // Expiring soon
        } else {
            return 1; // Active
        }
    }
}

// Refresh the dashboard
function refreshDashboard() {
    // Add loading animation to refresh button
    refreshDashboardBtn.classList.add('loading');
    
    // Initialize the dashboard
    initDashboard().finally(() => {
        // Remove loading animation
        refreshDashboardBtn.classList.remove('loading');
    });
}

// Initialize the dashboard
async function initDashboard() {
    console.log('Initializing dashboard');
    try {
        showLoading();
        await loadUserPreferences(); // Load preferences first
        
        // Fetch data using the statistics endpoint
        const data = await fetchStatistics(); 
        
        // Log the raw response
        console.log('Raw API Response for /api/statistics:', data);
        if (data && typeof data === 'object') {
            console.log('API Response type:', typeof data);
            console.log('API Response keys:', Object.keys(data));
        } else {
            console.log('API Response type:', typeof data);
        }

        // *** UPDATED VALIDATION ***
        // Check for required top-level keys directly on the data object
        if (!data || typeof data !== 'object' || !('active' in data) || !('expired' in data)) {
            throw new Error(`Invalid data structure received from statistics API. Missing required keys (active, expired). Received: ${JSON.stringify(data)}`);
        }

        // *** USE DATA DIRECTLY (No 'summary' object) ***
        const recentWarranties = data.recent_warranties || [];
        const allWarrantiesData = data.all_warranties || recentWarranties; // Use all_warranties if available

        // *** ADD LOGGING HERE ***
        console.log('API Data received:', JSON.stringify(data, null, 2)); // Log the whole data object
        console.log('Does data have all_warranties?', data.hasOwnProperty('all_warranties'));
        if (data.hasOwnProperty('all_warranties')) {
            console.log('Length of data.all_warranties:', data.all_warranties ? data.all_warranties.length : 'null/undefined');
        }
        console.log('Length of data.recent_warranties:', recentWarranties.length);
        console.log('Content being assigned to global allWarranties:', JSON.stringify(allWarrantiesData, null, 2));
        // *** END LOGGING ***

        // Store data for potential redraws, directly from 'data'
        currentStatusData = { 
            active: data.active || 0, 
            expiring_soon: data.expiring_soon || 0, 
            expired: data.expired || 0,
            total: data.total || 0 // Include total if needed
        };
        currentTimelineData = extractTimelineData(allWarrantiesData); // Use all warranties for timeline

        // Update UI using the structured data
        updateSummaryCounts(currentStatusData); // Pass the structured status data
        createStatusChart(currentStatusData);   // Pass the structured status data
        createTimelineChart(currentTimelineData);
        allWarranties = allWarrantiesData; // Store for filtering
        console.log('Global allWarranties length AFTER assignment:', allWarranties.length); // Log length after assignment
        filterAndSortWarranties(); // Apply initial filters/sort to the table

        // Attach sort listeners *after* initial render
        attachSortListeners();

        // Re-add other listeners previously in setupEventListeners
        const searchInput = document.getElementById('searchWarranties');
        const filterSelect = document.getElementById('statusFilter');
        const exportDataBtn = document.getElementById('exportBtn');
        const refreshBtn = document.getElementById('refreshDashboardBtn'); // Use the correct ID

        if (refreshBtn) {
            // Avoid adding multiple listeners if initDashboard is called again
            if (!refreshBtn.hasAttribute('data-listener-added')) {
                refreshBtn.addEventListener('click', refreshDashboard); // Call the refresh wrapper
                refreshBtn.setAttribute('data-listener-added', 'true');
            }
        }
        if (searchInput) {
            if (!searchInput.hasAttribute('data-listener-added')) {
                searchInput.addEventListener('input', filterAndSortWarranties);
                searchInput.setAttribute('data-listener-added', 'true');
            }
        }
        if (filterSelect) {
            if (!filterSelect.hasAttribute('data-listener-added')) {
                filterSelect.addEventListener('change', filterAndSortWarranties);
                filterSelect.setAttribute('data-listener-added', 'true');
            }
        }
        if (exportDataBtn) {
            if (!exportDataBtn.hasAttribute('data-listener-added')) {
                exportDataBtn.addEventListener('click', exportWarrantyData);
                exportDataBtn.setAttribute('data-listener-added', 'true');
            }
        }
        console.log("Attached other listeners (search, filter, export, refresh).")

        hideLoading();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        // Display error appropriately using showError function
        showError(error.message || 'Failed to load dashboard', error.stack);
    } finally {
        hideLoading(); // Ensure loading is hidden even on error
    }
}

// Helper function to extract timeline data from warranties
function extractTimelineData(warranties) {
    // Create a map to store counts by month and year
    const timelineMap = new Map();
    
    // Get current date for reference
    const today = new Date();
    
    // Process each warranty
    warranties.forEach(warranty => {
        if (warranty.expiration_date) {
            const expDate = new Date(warranty.expiration_date);
            const month = expDate.getMonth() + 1; // 1-12
            const year = expDate.getFullYear();
            
            // Create a key for this month/year
            const key = `${year}-${month}`;
            
            // Increment the count for this month/year
            if (timelineMap.has(key)) {
                timelineMap.set(key, timelineMap.get(key) + 1);
            } else {
                timelineMap.set(key, 1);
            }
        }
    });
    
    // Convert the map to an array of objects
    const timeline = Array.from(timelineMap.entries()).map(([key, count]) => {
        const [year, month] = key.split('-').map(Number);
        return { year, month, count };
    });
    
    // Sort by date
    timeline.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
    });
    
    return timeline;
}

// Function to load user preferences
async function loadUserPreferences() {
    try {
        // Get the auth token
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        // Get preferences from API
        const response = await fetch('/api/auth/preferences', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.expiring_soon_days) {
                EXPIRING_SOON_DAYS = data.expiring_soon_days;
                console.log('Loaded expiring soon days from preferences:', EXPIRING_SOON_DAYS);
            }
        }
    } catch (error) {
        console.error('Error loading user preferences:', error);
    }
}

// Update the sort header classes
function updateSortHeaderClasses() {
    sortableHeaders.forEach(header => {
        const column = header.getAttribute('data-sort');
        header.classList.remove('sort-asc', 'sort-desc');
        
        if (column === currentSort.column) {
            header.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Function to display overall status counts
function displayStatus(data) {
    document.getElementById('totalCount').textContent = data.total_count;
    document.getElementById('activeCount').textContent = data.active_count;
    document.getElementById('expiringCount').textContent = data.expiring_soon_count;
    document.getElementById('expiredCount').textContent = data.expired_count;
}

// Function to display errors
function displayError(error) {
    const statusContent = document.getElementById('statusContent'); // Assuming a main container
    if (!statusContent) return;
    statusContent.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to Load Status</h3>
            <p>Could not retrieve warranty status data. Please try again later.</p>
            <p>Error: ${error.message}</p>
        </div>
    `;
}

// Function to display recently expired/expiring warranties in the table
function displayRecentExpirations(expirations) {
    const tableBody = document.getElementById('recentExpirationsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear existing rows

    if (!expirations || expirations.length === 0) {
        tableBody.innerHTML = '<tr class="empty-row"><td colspan="5" class="no-data">No warranties expiring soon or recently expired.</td></tr>';
        return;
    }

    expirations.forEach(warranty => {
        const row = tableBody.insertRow();
        const statusClass = warranty.status.toLowerCase().replace('_', '-'); // e.g., expiring-soon
        row.classList.add(`status-${statusClass}`);

        // Calculate days remaining/past
        let daysText = 'N/A';
        if (warranty.days_remaining !== null) {
            if (warranty.days_remaining < 0) {
                daysText = `${Math.abs(warranty.days_remaining)} days ago`;
            } else {
                daysText = `in ${warranty.days_remaining} days`;
            }
        }

        row.innerHTML = `
            <td>${warranty.product_name}</td>
            <td>${new Date(warranty.purchase_date).toLocaleDateString()}</td>
            <td>${new Date(warranty.expiration_date).toLocaleDateString()} (${daysText})</td>
            <td><span class="status-${statusClass}">${warranty.status.replace('_', ' ')}</span></td>
        `;
    });
}

// Export warranty data as CSV
function exportWarrantyData() {
    // Get filtered and sorted warranties based on current view state
    const searchTerm = document.getElementById('searchWarranties').value.toLowerCase();
    const statusValue = document.getElementById('statusFilter').value;
    const today = new Date();
    
    // Filter warranties (similar logic to filterAndSortWarranties)
    let filteredWarranties = allWarranties.filter(warranty => {
        const productName = (warranty.product_name || '').toLowerCase();
        const matchesSearch = searchTerm === '' || productName.includes(searchTerm);
        if (!matchesSearch) return false;

        if (statusValue === 'all') return true;
        if (!warranty.expiration_date) return false;
        
        const expirationDate = new Date(warranty.expiration_date);
        if (statusValue === 'expired') return expirationDate <= today;
        
        const timeDiff = expirationDate - today;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        if (statusValue === 'expiring') return expirationDate > today && daysDiff <= EXPIRING_SOON_DAYS;
        if (statusValue === 'active') return expirationDate > today && daysDiff > EXPIRING_SOON_DAYS;
        
        return false; // Should not happen if statusValue is valid
    });
    
    // Sort warranties based on current sort settings
    filteredWarranties.sort((a, b) => {
        let valueA, valueB;
        switch (currentSort.column) {
            case 'product': valueA = a.product_name || ''; valueB = b.product_name || ''; break;
            case 'purchase': valueA = new Date(a.purchase_date || 0); valueB = new Date(b.purchase_date || 0); break;
            case 'status': valueA = getStatusPriority(a.expiration_date, today); valueB = getStatusPriority(b.expiration_date, today); break;
            default: valueA = new Date(a.expiration_date || 0); valueB = new Date(b.expiration_date || 0); // Default to expiration
        }
        if (currentSort.direction === 'asc') {
            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        } else {
            return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
        }
    });
    
    if (filteredWarranties.length === 0) {
        showToast('No data to export based on current filters', 'warning');
        return;
    }
    
    // Create CSV content
    let csvContent = 'Product,Purchase Date,Expiration Date,Status\n';
    filteredWarranties.forEach(warranty => {
        const purchaseDate = warranty.purchase_date ? new Date(warranty.purchase_date).toLocaleDateString() : 'N/A';
        const expirationDate = warranty.expiration_date ? new Date(warranty.expiration_date).toLocaleDateString() : 'N/A';
        const status = getStatusText(warranty.expiration_date, today);
        const escapedProductName = (warranty.product_name || '').includes(',') 
            ? `"${warranty.product_name}"` 
            : warranty.product_name;
        csvContent += `${escapedProductName},${purchaseDate},${expirationDate},${status}\n`;
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'warranty_status_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up blob URL
    showToast('Data exported successfully', 'success');
}

// Helper to get status text
function getStatusText(expirationDateStr, today) {
    if (!expirationDateStr) return 'Unknown';
    const expirationDate = new Date(expirationDateStr);
    if (expirationDate <= today) return 'Expired';
    const timeDiff = expirationDate - today;
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    if (daysDiff <= EXPIRING_SOON_DAYS) return 'Expiring Soon';
    return 'Active';
}

// Define attachSortListeners globally within the script scope
function attachSortListeners() {
    const headers = document.querySelectorAll('.sortable');
    headers.forEach(header => {
        // Clear potentially existing listener to prevent duplicates if this is called multiple times
        // A more robust way might involve checking if a listener already exists, but this is simpler
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);

        newHeader.addEventListener('click', () => {
            const column = newHeader.getAttribute('data-sort');
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            updateSortHeaderClasses();
            filterAndSortWarranties();
        });
    });
    console.log("Attached sort listeners.");
}

// --- Initialization --- 
// IMPORTANT: Ensure ALL function definitions are ABOVE this listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('Status page DOM loaded');
    // showLoading(); // Loading is shown inside initDashboard

    // Initialize theme toggle state *after* DOM is loaded
    if (darkModeToggle) {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        darkModeToggle.checked = currentTheme === 'dark';
        darkModeToggle.addEventListener('change', function() {
            setTheme(this.checked);
            redrawChartsWithNewTheme(); 
        });
        console.log(`Initialized theme toggle to: ${darkModeToggle.checked ? 'dark' : 'light'}`);
    }

    // Initialize the main dashboard logic
    initDashboard();

    // Setup event listeners for search/filter/export/sort
    // setupEventListeners(); // Removed: listeners now attached in initDashboard

    // Setup settings menu (assuming it's part of the shared header)
    // if (typeof setupSettingsMenu === 'function') { 
    //     setupSettingsMenu(); 
    // } else if (window.auth && typeof window.auth.setupSettingsMenu === 'function') {
    //     window.auth.setupSettingsMenu();
    // }
});