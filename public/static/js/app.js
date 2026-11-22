/* ==========================================================================
   ShareLoop Frontend Controller (static/js/app.js)
   Full-Stack SPA Controller for templates/index.html & templates/login.html
   ========================================================================== */

let currentUser = window.SHARELOOP_INITIAL_USER || window.SHARELOOP_USER || null;
let currentView = 'browse';
let browseItemsList = [];
let myListingsList = [];
let myRequestsList = [];
let incomingRequestsList = [];
let feedRequestsList = [];
let currentInspectItem = null;
let currentInspectRequest = null;
let pendingConfirmCallback = null;
let cachedAdminOverview = null;
let selectedAdminTxStatus = 'All';
let cachedAdminActiveAccounts = [];
let selectedActiveAccountRoleFilter = 'Student';

const CATEGORY_TAXONOMY = {
  'School Education': [
    'Primary (Class 1-5)',
    'Lower Secondary (Class 6-8)',
    'Secondary (9-10)',
    'Higher Secondary (Class 11-12)'
  ],
  'Higher Education': [
    'Science, Tech & Engineering (STEM)',
    'Business, Management & Economics',
    'Humanities, Arts & Social Sciences',
    'Medicine, Health & Life Sciences'
  ],
  'Equipment & Gear': [
    'Lab Gear & Equipment',
    'Stationeries & School Supplies'
  ],
  'Others': [
    'Others'
  ]
};

const NEPALI_PHONE_DASH_REGEX = /^(?:\(\+977\)\s*|\+977[\s\-]?)?([0-9]{10})$/;

// --------------------------------------------------------------------------
// 1. INITIALIZATION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (window.SHARELOOP_INITIAL_USER) {
    currentUser = window.SHARELOOP_INITIAL_USER;
  }

  initCategoryComboboxes();
  syncUserHeaderAndComposer();

  // Close category dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.searchable-combobox')) {
      document.querySelectorAll('.combobox-dropdown').forEach(el => el.classList.add('hidden'));
    }
  });

  if (currentUser && currentUser.role === 'Admin') {
    navigateTo('admin-overview');
  } else if (currentUser) {
    navigateTo('browse');
    loadAllRequests();
    if (currentUser.role === 'Student') {
      loadFeedWorkspace();
    }
  }
});

function getFirstName(userObj) {
  if (!userObj) return 'Student';
  if (userObj.first_name && userObj.first_name.trim()) {
    return userObj.first_name.trim();
  }
  const full = (userObj.name || '').trim();
  if (!full) return 'Student';
  return full.split(/\s+/)[0];
}

function syncUserHeaderAndComposer() {
  if (!currentUser) return;

  const initialsEl = document.getElementById('topbar-user-initials');
  const nameEl = document.getElementById('topbar-user-name');
  const roleBadge = document.getElementById('topbar-role-badge');
  const sidebarRoleTitle = document.getElementById('sidebar-role-title');
  const sidebarUni = document.getElementById('sidebar-university');

  if (initialsEl) initialsEl.textContent = currentUser.initials || 'U';
  if (nameEl) nameEl.textContent = currentUser.name || '';
  if (roleBadge) roleBadge.textContent = `${currentUser.role || 'Student'} Portal`;
  if (sidebarRoleTitle) sidebarRoleTitle.textContent = `${currentUser.role || 'Student'} Account`;
  if (sidebarUni) sidebarUni.textContent = currentUser.university || '';

  const feedAvatar = document.getElementById('feed-composer-avatar');
  const feedComposerInput = document.getElementById('feed-composer-trigger-input');
  if (feedAvatar) {
    feedAvatar.textContent = currentUser.initials || 'ST';
  }
  if (feedComposerInput) {
    feedComposerInput.placeholder = `Broadcast What You Need, ${getFirstName(currentUser)}?`;
  }
}

// --------------------------------------------------------------------------
// 2. TOAST & SAFE OPERATIONAL CONFIRMATION MODAL
// --------------------------------------------------------------------------
let toastTimeout = null;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = message;
  toast.className = isError ? 'toast error' : 'toast';
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3800);
}

function openConfirmModal(message, acceptLabel, onConfirm) {
  const backdrop = document.getElementById('confirm-modal-backdrop');
  const msgEl = document.getElementById('confirm-modal-message');
  const acceptBtn = document.getElementById('confirm-modal-accept-btn');
  if (!backdrop || !msgEl || !acceptBtn) return;

  msgEl.textContent = message;
  acceptBtn.textContent = acceptLabel || 'Confirm';
  pendingConfirmCallback = onConfirm;
  backdrop.classList.remove('hidden');
}

function closeConfirmModal() {
  const backdrop = document.getElementById('confirm-modal-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
  pendingConfirmCallback = null;
}

function executeConfirmedAction() {
  const cb = pendingConfirmCallback;
  closeConfirmModal();
  if (typeof cb === 'function') {
    cb();
  }
}

function requestLogoutConfirmation() {
  openConfirmModal('Are you sure you want to log out of your ShareLoop account?', 'Logout', performLogout);
}

async function performLogout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    const emailToSave = data.last_email || (currentUser && currentUser.email) || '';
    if (emailToSave) {
      sessionStorage.setItem('shareloop_last_logout_email', emailToSave);
    }
  } catch (err) {
    if (currentUser && currentUser.email) {
      sessionStorage.setItem('shareloop_last_logout_email', currentUser.email);
    }
  }
  window.location.href = '/login';
}

// --------------------------------------------------------------------------
// 3. CORE SPA NAVIGATION ENGINE & MOBILE DRAWER
// --------------------------------------------------------------------------
function toggleMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.add('hidden');
  document.body.style.overflow = '';
}

function navigateTo(viewName) {
  closeMobileSidebar();
  currentView = viewName;

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.add('hidden');
  });

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.remove('active');
  });

  const navMap = {
    'browse': 'nav-browse',
    'feed': (currentUser && currentUser.role === 'Admin') ? 'nav-admin-feed' : 'nav-feed',
    'org-broadcasts': 'nav-org-broadcasts',
    'org-create-broadcast': 'nav-org-broadcasts',
    'org-record-broadcast': (currentUser && currentUser.role === 'Organization') ? 'nav-org-broadcasts' : 'nav-feed',
    'org-broadcast-records': 'nav-org-broadcasts',
    'my-contributions': 'nav-my-contributions',
    'my-listings': 'nav-my-listings',
    'add-resource': 'nav-my-listings',
    'my-requests': 'nav-my-requests',
    'incoming': 'nav-incoming',
    'profile': 'nav-profile',
    'security': 'nav-security',
    'admin-overview': 'nav-admin-overview',
    'admin-resources': 'nav-admin-resources',
    'admin-feed': 'nav-admin-feed',
    'admin-transactions': 'nav-admin-transactions',
    'admin-active-accounts': 'nav-admin-active-accounts',
    'admin-pending-accounts': 'nav-admin-pending-accounts'
  };

  const activeNavId = navMap[viewName];
  if (activeNavId) {
    const navBtn = document.getElementById(activeNavId);
    if (navBtn) navBtn.classList.add('active');
  }

  const targetSection = document.getElementById(`view-${viewName === 'admin-feed' ? 'feed' : viewName}`);
  if (targetSection) {
    targetSection.classList.remove('hidden');
  }

  // Trigger contextual data fetch
  if (viewName === 'browse') {
    loadBrowseItems();
  } else if (viewName === 'org-broadcasts') {
    loadOrgBroadcasts();
  } else if (viewName === 'org-create-broadcast') {
    initOrgCreateBroadcastView();
  } else if (viewName === 'my-contributions') {
    loadMyContributions();
  } else if (viewName === 'feed' || viewName === 'admin-feed') {
    syncUserHeaderAndComposer();
    loadFeedWorkspace();
  } else if (viewName === 'my-listings') {
    loadMyListings();
  } else if (viewName === 'my-requests' || viewName === 'incoming') {
    loadAllRequests();
  } else if (viewName === 'admin-overview') {
    loadAdminOverview();
    loadAdminPendingAccountsBadgeOnly();
  } else if (viewName === 'admin-resources') {
    loadAdminResources();
  } else if (viewName === 'admin-transactions') {
    loadAdminTransactions();
  } else if (viewName === 'admin-active-accounts') {
    loadAdminActiveAccounts();
  } else if (viewName === 'admin-pending-accounts') {
    loadAdminPendingAccounts();
  }
}

const switchView = navigateTo;

function handleSidebarNavWithDrawer(viewName, drawerContext) {
  if (currentView === viewName && drawerContext) {
    toggleFilterDrawer(drawerContext);
    return;
  }
  navigateTo(viewName);
}

function toggleFilterDrawer(context, forceOpen = null) {
  const isAdminCtx = context === 'admin';
  const drawerId = isAdminCtx ? 'admin-filter-drawer' : 'browse-filter-drawer';
  const layoutId = isAdminCtx ? 'admin-resources-layout-container' : 'browse-layout-container';
  const btnId = isAdminCtx ? 'admin-filter-toggle-btn' : 'browse-filter-toggle-btn';

  const drawer = document.getElementById(drawerId);
  const layout = document.getElementById(layoutId);
  const btn = document.getElementById(btnId);
  if (!drawer) return;

  const isCurrentlyHidden = drawer.classList.contains('hidden');
  const shouldOpen = forceOpen !== null ? Boolean(forceOpen) : isCurrentlyHidden;

  if (shouldOpen) {
    drawer.classList.remove('hidden');
    if (layout) {
      layout.classList.remove('drawer-closed');
      layout.classList.add('drawer-open');
    }
    if (btn) {
      btn.textContent = 'Hide Filters';
      btn.setAttribute('aria-expanded', 'true');
    }
  } else {
    drawer.classList.add('hidden');
    if (layout) {
      layout.classList.remove('drawer-open');
      layout.classList.add('drawer-closed');
    }
    if (btn) {
      btn.textContent = 'Show Filters';
      btn.setAttribute('aria-expanded', 'false');
    }
  }
}

let searchDebounceTimer = null;
function handleSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    if (currentUser && currentUser.role === 'Admin') {
      if (currentView !== 'admin-resources') {
        navigateTo('admin-resources');
      } else {
        loadAdminResources();
      }
    } else {
      if (currentView !== 'browse') {
        navigateTo('browse');
      } else {
        loadBrowseItems();
      }
    }
  }, 220);
}

// --------------------------------------------------------------------------
// 4. SEARCHABLE & SCROLLABLE CATEGORY COMBOBOXES ('res' & 'feed')
// --------------------------------------------------------------------------
function initCategoryComboboxes() {
  renderCategoryDropdownOptions('res', '');
  renderCategoryDropdownOptions('feed', '');
}

function renderCategoryDropdownOptions(prefix, query = '') {
  const dropdown = document.getElementById(`${prefix}-category-dropdown`);
  const hiddenInput = document.getElementById(`${prefix}-category`);
  if (!dropdown) return;

  const selectedValue = hiddenInput ? hiddenInput.value : '';
  const q = (query || '').trim().toLowerCase();
  let html = '';
  let matchesCount = 0;

  Object.entries(CATEGORY_TAXONOMY).forEach(([groupTitle, categories]) => {
    const matchingCats = categories.filter(cat =>
      !q || cat.toLowerCase().includes(q) || groupTitle.toLowerCase().includes(q)
    );
    if (matchingCats.length > 0) {
      matchesCount += matchingCats.length;
      html += `
        <div class="combobox-group">
          <div class="combobox-group-title">${escapeHtml(groupTitle)}</div>
          ${matchingCats.map(cat => {
        const isSelected = cat === selectedValue;
        return `
              <button
                type="button"
                class="combobox-option ${isSelected ? 'selected' : ''}"
                onclick="selectCategoryComboboxOption('${prefix}', '${escapeAttr(cat)}')"
              >
                <span>${escapeHtml(cat)}</span>
                ${isSelected ? '<span class="combobox-check">&#10003;</span>' : ''}
              </button>
            `;
      }).join('')}
        </div>
      `;
    }
  });

  if (matchesCount === 0) {
    html = `<div class="combobox-empty">No matching categories found.</div>`;
  }

  dropdown.innerHTML = html;
}

function openCategoryCombobox(prefix) {
  const dropdown = document.getElementById(`${prefix}-category-dropdown`);
  if (!dropdown) return;
  renderCategoryDropdownOptions(prefix, '');
  dropdown.classList.remove('hidden');
}

function toggleCategoryCombobox(prefix) {
  const dropdown = document.getElementById(`${prefix}-category-dropdown`);
  if (!dropdown) return;
  if (dropdown.classList.contains('hidden')) {
    renderCategoryDropdownOptions(prefix, '');
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

function filterCategoryCombobox(prefix, query) {
  const dropdown = document.getElementById(`${prefix}-category-dropdown`);
  if (!dropdown) return;
  renderCategoryDropdownOptions(prefix, query);
  dropdown.classList.remove('hidden');
}

function selectCategoryComboboxOption(prefix, categoryValue) {
  const hiddenInput = document.getElementById(`${prefix}-category`);
  const searchInput = document.getElementById(`${prefix}-category-search`);
  const dropdown = document.getElementById(`${prefix}-category-dropdown`);

  if (hiddenInput) hiddenInput.value = categoryValue;
  if (searchInput) searchInput.value = categoryValue;
  if (dropdown) dropdown.classList.add('hidden');
}

// --------------------------------------------------------------------------
// 5. BROWSE EXCHANGE & MULTI-SELECT FILTER PANEL
// --------------------------------------------------------------------------
function filterSidebarCategoryList(query) {
  const scrollbox = document.getElementById('filter-category-scrollbox');
  if (!scrollbox) return;
  const q = (query || '').trim().toLowerCase();

  scrollbox.querySelectorAll('.category-filter-group').forEach(group => {
    let visibleCount = 0;
    group.querySelectorAll('.category-filter-item').forEach(item => {
      const label = (item.dataset.label || item.textContent || '').toLowerCase();
      if (!q || label.includes(q)) {
        item.style.display = 'flex';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });
    group.style.display = visibleCount > 0 ? 'block' : 'none';
  });
}

function resetAllFilters() {
  document.querySelectorAll('.filter-category, .filter-condition').forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll('.filter-exchange').forEach(cb => {
    if (currentUser && currentUser.role === 'Organization' && cb.value === 'Donate') {
      cb.checked = true;
    } else {
      cb.checked = false;
    }
  });
  const availOnly = document.getElementById('filter-available-only');
  if (availOnly) availOnly.checked = true;

  const catSearch = document.getElementById('filter-category-search');
  if (catSearch) {
    catSearch.value = '';
    filterSidebarCategoryList('');
  }
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) globalSearch.value = '';

  loadBrowseItems();
}

async function loadBrowseItems() {
  const grid = document.getElementById('browse-items-grid');
  if (!grid) return;

  const search = (document.getElementById('global-search-input')?.value || '').trim();
  const selectedExchanges = Array.from(document.querySelectorAll('.filter-exchange:checked')).map(el => el.value);
  const selectedCategories = Array.from(document.querySelectorAll('.filter-category:checked')).map(el => el.value);
  const selectedConditions = Array.from(document.querySelectorAll('.filter-condition:checked')).map(el => el.value);
  const availableOnly = document.getElementById('filter-available-only')?.checked ?? false;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (selectedExchanges.length) params.set('exchange_types', selectedExchanges.join(','));
  if (selectedCategories.length) params.set('categories', selectedCategories.join('||'));
  if (selectedConditions.length) params.set('conditions', selectedConditions.join(','));
  if (availableOnly) params.set('available_only', 'true');

  try {
    const res = await fetch(`/api/items?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    browseItemsList = data.items || [];

    if (browseItemsList.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No matching resources found</h3>
          <p>Try clearing some filters or searching for another textbook, course code, or lab item.</p>
          <button type="button" class="btn-outline btn-sm" onclick="resetAllFilters()">Reset Filters</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = browseItemsList.map(item => renderBrowseItemCard(item)).join('');
  } catch (err) {
    console.error('Error loading browse items:', err);
  }
}

function getExchangeBadgeClass(exchangeType) {
  if (exchangeType === 'Donate') return 'badge-green';
  if (exchangeType === 'Swap') return 'badge-amber';
  return 'badge-blue';
}

function renderBrowseItemCard(item) {
  const isMine = currentUser && item.owner_id === currentUser.id;
  const ownerName = item.owner ? item.owner.name : 'Campus Peer';
  const exchangeClass = getExchangeBadgeClass(item.exchange_type);

  return `
    <article class="item-card" onclick="openItemDetails(${item.id})">
      <div>
        <div class="item-card-image-wrap">
          <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <div class="item-card-badges">
            <span class="badge ${exchangeClass}">${escapeHtml(item.exchange_type)}</span>
            <span class="badge badge-neutral">${escapeHtml(item.condition)}</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="item-card-meta">
            <span class="course-tag">${escapeHtml(item.course_code || 'GEN 101')}</span>
            <span class="category-tag">${escapeHtml(item.category)}</span>
          </div>
          <h3 class="item-card-title">${escapeHtml(item.title)}</h3>
          <p class="item-card-author">${escapeHtml(item.author)}</p>
          <p class="item-card-owner">
            Shared by <strong>${escapeHtml(ownerName)}</strong>
            ${isMine ? '<span class="mine-tag">(You)</span>' : ''}
          </p>
        </div>
      </div>
      <div class="item-card-footer">
        <span class="status-pill ${item.is_available ? 'available' : 'unavailable'}">
          ${item.is_available ? 'Available' : 'Unavailable'}
        </span>
        <span class="link-btn">View details</span>
      </div>
    </article>
  `;
}

// --------------------------------------------------------------------------
// 6. ITEM DETAILS & 4-SLOT PHOTO GALLERY INSPECT VIEW
// --------------------------------------------------------------------------
async function openItemDetails(itemId, returnView = null) {
  try {
    const res = await fetch(`/api/items/${itemId}`);
    if (!res.ok) {
      showToast('Could not load item details.', true);
      return;
    }
    const data = await res.json();
    const item = data.item || data;
    currentInspectItem = item;

    const backBtn = document.getElementById('item-details-back-btn');
    if (backBtn) {
      if (currentUser && currentUser.role === 'Admin') {
        backBtn.innerHTML = '&larr; Back to Resource Feed';
        backBtn.onclick = () => navigateTo('admin-resources');
      } else if (returnView) {
        backBtn.innerHTML = '&larr; Back';
        backBtn.onclick = () => navigateTo(returnView);
      } else {
        const label = currentUser && currentUser.role === 'Organization' ? 'Listings' : 'Browse Exchange';
        backBtn.innerHTML = `&larr; Back to ${label}`;
        backBtn.onclick = () => navigateTo('browse');
      }
    }

    renderItemDetails(item);

    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    const section = document.getElementById('view-item-details');
    if (section) section.classList.remove('hidden');
  } catch (err) {
    console.error('Error opening item details:', err);
  }
}

function switchDetailGalleryPhoto(photoUrl, thumbBtn) {
  const mainImg = document.getElementById('detail-primary-photo');
  if (mainImg && photoUrl) {
    mainImg.src = photoUrl;
  }
  document.querySelectorAll('.detail-gallery-thumb').forEach(btn => {
    btn.style.borderColor = 'var(--line)';
  });
  if (thumbBtn) {
    thumbBtn.style.borderColor = 'var(--pen)';
  }
}

function renderItemDetails(item) {
  const container = document.getElementById('item-details-container');
  if (!container) return;

  const isOwner = currentUser && item.owner_id === currentUser.id;
  const isAdmin = currentUser && currentUser.role === 'Admin';
  const owner = item.owner || {};

  const photoSlots = [
    { label: '1. Main Photo', url: item.front_cover_path || item.image_url },
    { label: '2. Back / Side View', url: item.back_cover_path },
    { label: '3. Detail / Defect Zoom', url: item.spine_path },
    { label: '4. Additional View', url: item.inside_pages_path }
  ].filter(slot => slot.url && slot.url.trim() !== '');

  const primaryPhoto = photoSlots.length > 0 ? photoSlots[0].url : item.image_url;

  let actionAreaHTML = '';
  if (isAdmin) {
    // Admin review mode: strip "Request This Resource" and "Mark Available"; show only Delete Listing
    actionAreaHTML = `
      <div class="detail-actions-row">
        <button type="button" class="btn-danger" onclick="confirmDeleteItem(${item.id})">
          Delete Listing
        </button>
      </div>
    `;
  } else if (isOwner) {
    actionAreaHTML = `
      <div class="detail-actions-row">
        <button type="button" class="btn-primary" onclick="openEditResourceView(${item.id})">
          Edit Listing
        </button>
        <button type="button" class="btn-danger" onclick="confirmDeleteItem(${item.id})">
          Delete Listing
        </button>
      </div>
    `;
  } else if (!item.is_available) {
    actionAreaHTML = `
      <div class="unavailable-banner">
        This resource is currently marked as Unavailable.
      </div>
    `;
  } else {
    actionAreaHTML = `
      <div class="request-compose-box">
        <label for="detail-request-notes">Pickup &amp; Coordination Note (Optional)</label>
        <textarea
          id="detail-request-notes"
          rows="3"
          placeholder="Hi ${escapeHtml(owner.name || 'there')}! When and where on campus works best for pickup?"
        ></textarea>
        <button type="button" id="detail-request-submit-btn" class="btn-primary btn-full" onclick="handleCreateExchangeRequest(${item.id})">
          Request This Resource (${escapeHtml(item.exchange_type)})
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-left">
        <div class="detail-image-card">
          <img id="detail-primary-photo" src="${escapeHtml(primaryPhoto)}" alt="${escapeHtml(item.title)}" />
          ${photoSlots.length > 1 ? `
            <div style="display: grid; grid-template-columns: repeat(${photoSlots.length}, 1fr); gap: 8px; margin-top: 12px;">
              ${photoSlots.map((slot, idx) => `
                <button
                  type="button"
                  class="detail-gallery-thumb"
                  onclick="switchDetailGalleryPhoto('${escapeAttr(slot.url)}', this)"
                  style="border: 2px solid ${idx === 0 ? 'var(--pen)' : 'var(--line)'}; border-radius: 8px; padding: 4px; background: #fff; cursor: pointer; text-align: center;"
                >
                  <img src="${escapeHtml(slot.url)}" alt="${escapeHtml(slot.label)}" style="width: 100%; height: 58px; object-fit: cover; border-radius: 5px; display: block;" />
                  <small style="display: block; font-size: 0.68rem; color: var(--ink-2); margin-top: 3px; font-weight: 600;">${escapeHtml(slot.label)}</small>
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="owner-card">
          <span class="section-eyebrow">Shared by</span>
          <div class="owner-row">
            <div class="avatar-circle lg">${escapeHtml(owner.initials || 'U')}</div>
            <div>
              <h4>${escapeHtml(owner.name || 'Campus Member')}</h4>
              <p>${escapeHtml(owner.role || 'Student')} ${owner.university ? '• ' + escapeHtml(owner.university) : ''}</p>
              <small>${owner.completed_exchanges ?? 0} Completed Exchanges</small>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-right">
        <div class="detail-spec-card">
          <div class="detail-badges">
            <span class="course-tag">${escapeHtml(item.course_code || 'GEN 101')}</span>
            <span class="badge ${getExchangeBadgeClass(item.exchange_type)}">${escapeHtml(item.exchange_type)}</span>
            <span class="status-pill ${item.is_available ? 'available' : 'unavailable'}">
              ${item.is_available ? 'Available' : 'Unavailable'}
            </span>
          </div>

          <h1>${escapeHtml(item.title)}</h1>
          <p class="detail-author">By ${escapeHtml(item.author)}</p>

          <div class="spec-table">
            <div class="spec-row">
              <span>Category</span>
              <strong>${escapeHtml(item.category)}</strong>
            </div>
            <div class="spec-row">
              <span>Condition</span>
              <strong>${escapeHtml(item.condition)}</strong>
            </div>
            <div class="spec-row">
              <span>Exchange Mode</span>
              <strong>${escapeHtml(item.exchange_type)}</strong>
            </div>
            <div class="spec-row">
              <span>Listed Date</span>
              <strong>${escapeHtml(item.created_at || 'Recently')}</strong>
            </div>
          </div>

          ${actionAreaHTML}
        </div>

        <div class="detail-desc-card">
          <h3>Resource Description &amp; Notes</h3>
          <p>${escapeHtml(item.description || 'No additional description provided.')}</p>
        </div>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// 7. STUDENT REQUEST FEED & ASSOCIATED INTERACTION MODALS
// --------------------------------------------------------------------------
function openFeedCreateModal() {
  const backdrop = document.getElementById('feed-create-modal-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('hidden');

  const titleInput = document.getElementById('feed-title');
  if (titleInput) {
    setTimeout(() => titleInput.focus(), 50);
  }
}

function closeFeedCreateModal() {
  const backdrop = document.getElementById('feed-create-modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
  }
}

// --------------------------------------------------------------------------
// REAL-TIME FEED SYNC ENGINE (BroadcastChannel + 2.5s Polling + Optimistic Deletes)
// --------------------------------------------------------------------------
let feedBroadcastChannel = null;
let feedSyncTimer = null;
let cachedFeedChecksum = '';

try {
  feedBroadcastChannel = new BroadcastChannel('shareloop_feed_sync');
  feedBroadcastChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'FEED_CHANGED') {
      if (currentView === 'feed' || currentView === 'admin-feed') {
        loadFeedWorkspace(true);
      }
    }
  };
} catch (e) {
  // Graceful fallback for older environments
}

window.addEventListener('storage', (e) => {
  if (e.key === 'shareloop_feed_timestamp') {
    if (currentView === 'feed' || currentView === 'admin-feed') {
      loadFeedWorkspace(true);
    }
  }
});

function broadcastFeedSync() {
  if (feedBroadcastChannel) {
    try {
      feedBroadcastChannel.postMessage({ type: 'FEED_CHANGED', timestamp: Date.now() });
    } catch (e) {}
  }
  try {
    localStorage.setItem('shareloop_feed_timestamp', Date.now().toString());
  } catch (e) {}
}

function ensureFeedSyncTimer() {
  if (feedSyncTimer) return;
  feedSyncTimer = setInterval(() => {
    if (currentView === 'feed' || currentView === 'admin-feed') {
      loadFeedWorkspace(true);
    } else if (currentView === 'org-broadcasts') {
      loadOrgBroadcasts(true);
    }
  }, 2500);
}

async function loadFeedWorkspace(isSilent = false) {
  const container = document.getElementById('feed-stream-container');
  if (!container) return;

  ensureFeedSyncTimer();

  try {
    const res = await fetch('/api/feed/active');
    if (!res.ok) return;
    const data = await res.json();
    const newItems = data.feed_requests || data.items || [];
    const orgBroadcasts = data.org_broadcasts || [];
    cachedFeedOrgBroadcasts = orgBroadcasts;

    // Checksum based on student request IDs + org broadcasts to prevent unnecessary DOM re-rendering & flickering
    const newChecksum = [
      ...newItems.map(p => `${p.id}-${p.is_active}`),
      ...orgBroadcasts.map(b => `${b.id}-${b.items_secured}-${b.is_active}`)
    ].join('|');

    if (isSilent && newChecksum === cachedFeedChecksum && container.children.length > 0) {
      return;
    }
    cachedFeedChecksum = newChecksum;
    feedRequestsList = newItems;

    if (feedRequestsList.length === 0 && orgBroadcasts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No active campus requests right now</h3>
          <p>${(currentUser && currentUser.role === 'Admin') ? 'There are currently no active student broadcast requests or community relief drives in the system.' : 'Click the status box above to broadcast a textbook, calculator, or lab item you need!'}</p>
        </div>
      `;
      return;
    }

    const orgCardsHtml = orgBroadcasts.map(b => renderOrgBroadcastCard(b, false)).join('');
    const studentCardsHtml = feedRequestsList.map(post => {
      const isMine = currentUser && post.student_id === currentUser.id;
      return `
        <article class="feed-card" id="feed-card-${post.id}">
          <div class="feed-card-top">
            <span class="badge badge-green">${escapeHtml(post.category)}</span>
            <span class="text-muted">${escapeHtml(post.created_at)}</span>
          </div>
          <h3 class="feed-card-title">${escapeHtml(post.title)}</h3>
          <p class="feed-card-desc">${escapeHtml(post.description || 'No additional details specified.')}</p>
          <div class="feed-card-footer">
            <div class="feed-poster-meta">
              <span class="avatar-circle">${escapeHtml(post.student_initials || 'ST')}</span>
              <div>
                <strong style="font-size: 0.86rem; color: var(--ink); display: block;">
                  ${escapeHtml(post.student_name)}
                  ${isMine ? '<span class="mine-tag">(You)</span>' : ''}
                </strong>
                ${post.student_university ? `<span class="text-muted">${escapeHtml(post.student_university)}</span>` : ''}
              </div>
            </div>
            <div>
              ${currentUser && currentUser.role === 'Admin'
                ? `<button type="button" class="btn-danger btn-sm" onclick="confirmDeleteFeedRequest(${post.id}, '${escapeAttr(post.title)}')">Delete Post</button>`
                : isMine
                  ? `<div style="display: flex; align-items: center; gap: 0.5rem;">
                       <span class="badge badge-neutral">Your Active Broadcast</span>
                       <button type="button" class="btn-danger btn-sm" onclick="confirmDeleteFeedRequest(${post.id}, '${escapeAttr(post.title)}')">Delete</button>
                     </div>`
                  : `<button type="button" class="btn-primary btn-sm" onclick="openFeedRespondModal(${post.id})">I Have This</button>`
              }
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = orgCardsHtml + studentCardsHtml;
  } catch (err) {
    if (!isSilent) console.error('Error loading feed workspace:', err);
  }
}

function confirmDeleteFeedRequest(feedId, title) {
  openConfirmModal(
    `Are you sure you want to delete this request: "${title}"?`,
    'Delete Post',
    () => performDeleteFeedRequest(feedId)
  );
}

async function performDeleteFeedRequest(feedId) {
  // Optimistic real-time DOM removal with smooth fade-out
  const card = document.getElementById(`feed-card-${feedId}`);
  if (card) {
    card.style.transition = 'all 0.22s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.96)';
    setTimeout(() => { if (card) card.remove(); }, 220);
  }

  try {
    const res = await fetch(`/api/feed/${feedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete request.', true);
      await loadFeedWorkspace();
      return;
    }
    showToast(data.message || 'Request post deleted successfully.');
    broadcastFeedSync();
    await loadFeedWorkspace(true);
  } catch (err) {
    showToast(err.message || 'Error deleting request.', true);
    await loadFeedWorkspace();
  }
}

async function handleCreateFeedPost(event) {
  event.preventDefault();
  const titleEl = document.getElementById('feed-title');
  const categoryHidden = document.getElementById('feed-category');
  const categorySearch = document.getElementById('feed-category-search');
  const descEl = document.getElementById('feed-description');
  const submitBtn = document.getElementById('feed-create-submit-btn');

  const title = (titleEl?.value || '').trim();
  const category = (categoryHidden?.value || categorySearch?.value || 'Science, Tech & Engineering (STEM)').trim();
  const description = (descEl?.value || '').trim();

  if (!title || !category) {
    showToast('Please enter both a Requested Item Title and Category.', true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Broadcasting...';
  }

  try {
    const res = await fetch('/api/feed/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, description })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to broadcast request.');
    }

    const form = document.getElementById('feed-create-form');
    if (form) form.reset();
    if (categoryHidden) categoryHidden.value = 'Science, Tech & Engineering (STEM)';
    if (categorySearch) categorySearch.value = 'Science, Tech & Engineering (STEM)';

    closeFeedCreateModal();
    showToast(data.message || 'Your request has been broadcast to the Campus Feed!');
    broadcastFeedSync();
    await loadFeedWorkspace();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Broadcast Request to Campus Feed';
    }
  }
}

function updateFeedRespondSubmitState() {
  const file1 = document.getElementById('feed-file-front-cover');
  const file2 = document.getElementById('feed-file-back-cover');
  const submitBtn = document.getElementById('feed-respond-submit-btn');
  if (!submitBtn) return;

  const hasSlot1 = file1 && file1.files && file1.files.length > 0;
  const hasSlot2 = file2 && file2.files && file2.files.length > 0;
  submitBtn.disabled = !(hasSlot1 && hasSlot2);
}

function openFeedRespondModal(feedId) {
  const post = feedRequestsList.find(p => p.id === feedId);
  if (!post) return;

  const backdrop = document.getElementById('feed-respond-modal-backdrop');
  const form = document.getElementById('feed-respond-form');
  if (form) form.reset();

  const idInput = document.getElementById('feed-respond-id');
  const catInput = document.getElementById('feed-respond-category');
  const titleInput = document.getElementById('feed-res-title');
  const subEl = document.getElementById('feed-respond-target-sub');

  if (idInput) idInput.value = post.id;
  if (catInput) catInput.value = post.category;
  if (titleInput) titleInput.value = post.title;
  if (subEl) {
    subEl.textContent = `Responding to ${post.student_name}'s request for "${post.title}". Upload direct proof photos from your local device to verify you physically have this item and open a live pickup chat.`;
  }

  ['feed-preview-front-cover', 'feed-preview-back-cover', 'feed-preview-spine', 'feed-preview-inside-pages'].forEach(id => {
    const img = document.getElementById(id);
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
  });

  updateFeedRespondSubmitState();

  if (backdrop) {
    backdrop.classList.remove('hidden');
  }
}

function closeFeedRespondModal() {
  const backdrop = document.getElementById('feed-respond-modal-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Photo compression before upload. Hosted servers cap a request at about 4.5 MB,
// and phone photos are often 3-8 MB each, so photos are resized to 1600px on the
// long edge and re-encoded as JPEG before they leave the browser.
// ---------------------------------------------------------------------------
const UPLOAD_MAX_EDGE = 1600;
const UPLOAD_TOTAL_LIMIT = 4 * 1024 * 1024;

function compressImageFile(file) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 350 * 1024) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Replaces every photo in a FormData with a compressed copy. Returns false (and shows
// a message) if the photos are still too large to send together.
async function prepareUploadFormData(formData) {
  const entries = [];
  formData.forEach((value, key) => { if (value instanceof File && value.size > 0) entries.push([key, value]); });
  const keys = [...new Set(entries.map(([key]) => key))];
  keys.forEach((key) => formData.delete(key));
  let total = 0;
  for (const [key, file] of entries) {
    const smaller = await compressImageFile(file);
    total += smaller.size;
    formData.append(key, smaller, smaller.name);
  }
  if (total > UPLOAD_TOTAL_LIMIT) {
    showToast('These photos are too large to upload together. Use fewer photos or smaller ones (under 4 MB in total).', true);
    return false;
  }
  return true;
}

async function handleFeedRespondSubmit(event) {
  event.preventDefault();
  const feedId = document.getElementById('feed-respond-id')?.value;
  const file1 = document.getElementById('feed-file-front-cover');
  const file2 = document.getElementById('feed-file-back-cover');
  const submitBtn = document.getElementById('feed-respond-submit-btn');

  if (!feedId) return;

  // Dual-Photo Verification Rules: Freeze submission if either Slot 1 or Slot 2 is empty
  if (!file1?.files?.length || !file2?.files?.length) {
    showToast('Dual-Photo Requirement: Both Slot 1 (1. Main Photo) and Slot 2 (2. Back / Side View) are mandatory.', true);
    updateFeedRespondSubmitState();
    return;
  }

  const form = document.getElementById('feed-respond-form');
  const formData = new FormData(form);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading Proof & Starting Chat...';
  }

  try {
    if (!(await prepareUploadFormData(formData))) {
      throw new Error('');
    }
    const res = await fetch(`/api/feed/respond/${feedId}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload proof photos.');
    }

    closeFeedRespondModal();
    showToast(data.message || 'Proof photos verified! Opening pickup coordination chat...');
    broadcastFeedSync();

    await loadFeedWorkspace();
    await loadAllRequests();

    if (data.request && data.request.id) {
      await openRequestDetails(data.request.id);
    } else {
      navigateTo('incoming');
    }
  } catch (err) {
    if (err.message) showToast(err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload Proof & Start Pickup Chat';
    }
  }
}

// --------------------------------------------------------------------------
// 8. MY LISTINGS & ADD/EDIT RESOURCE (DUAL-PHOTO MANDATORY UPLOAD)
// --------------------------------------------------------------------------
function previewSelectedFile(inputEl, previewImgId) {
  const previewImg = document.getElementById(previewImgId);
  if (!previewImg) return;

  if (inputEl && inputEl.files && inputEl.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.classList.remove('hidden');
    };
    reader.readAsDataURL(inputEl.files[0]);
  } else {
    previewImg.src = '';
    previewImg.classList.add('hidden');
  }
}

async function loadMyListings() {
  const container = document.getElementById('my-listings-container');
  if (!container) return;

  try {
    const res = await fetch('/api/items?mine_only=true');
    if (!res.ok) return;
    const data = await res.json();
    myListingsList = data.items || [];

    if (myListingsList.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>You haven't listed any study resources yet</h3>
          <p>Share textbooks, lab coats, calculators, or study notes with peers on campus.</p>
          <button type="button" class="btn-primary btn-sm" onclick="openAddResourceView()">+ Add Your First Resource</button>
        </div>
      `;
      return;
    }

    container.innerHTML = myListingsList.map(item => `
      <div class="list-row-card">
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="list-row-thumb" />
        <div class="list-row-info">
          <div class="list-row-tags">
            <span class="course-tag">${escapeHtml(item.course_code || 'GEN 101')}</span>
            <span class="badge ${getExchangeBadgeClass(item.exchange_type)}">${escapeHtml(item.exchange_type)}</span>
            <span class="badge badge-neutral">${escapeHtml(item.condition)}</span>
            <span class="status-pill ${item.is_available ? 'available' : 'unavailable'}">
              ${item.is_available ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.author)} • ${escapeHtml(item.category)}</p>
        </div>
        <div class="list-row-actions">
          <button type="button" class="btn-outline btn-sm" onclick="openItemDetails(${item.id}, 'my-listings')">Inspect</button>
          <button type="button" class="btn-outline btn-sm" onclick="openEditResourceView(${item.id})">Edit</button>
          <button type="button" class="btn-danger btn-sm" onclick="confirmDeleteItem(${item.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading my listings:', err);
  }
}

function openAddResourceView() {
  const form = document.getElementById('resource-form');
  if (form) form.reset();

  document.getElementById('res-id').value = '';
  document.getElementById('resource-form-title').textContent = 'Add a Study Resource';
  document.getElementById('res-submit-btn').textContent = 'Publish Resource';
  document.getElementById('res-category').value = 'Science, Tech & Engineering (STEM)';
  document.getElementById('res-category-search').value = 'Science, Tech & Engineering (STEM)';
  document.getElementById('res-available').checked = true;

  ['preview-front-cover', 'preview-back-cover', 'preview-spine', 'preview-inside-pages'].forEach(id => {
    const img = document.getElementById(id);
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
  });

  navigateTo('add-resource');
}

async function openEditResourceView(itemId) {
  try {
    const res = await fetch(`/api/items/${itemId}`);
    if (!res.ok) return;
    const data = await res.json();
    const item = data.item || data;

    const form = document.getElementById('resource-form');
    if (form) form.reset();

    document.getElementById('res-id').value = item.id;
    document.getElementById('resource-form-title').textContent = 'Edit Study Resource';
    document.getElementById('res-submit-btn').textContent = 'Save Changes';
    document.getElementById('res-title').value = item.title || '';
    document.getElementById('res-author').value = item.author || '';
    document.getElementById('res-course').value = item.course_code || '';
    document.getElementById('res-category').value = item.category || 'Science, Tech & Engineering (STEM)';
    document.getElementById('res-category-search').value = item.category || 'Science, Tech & Engineering (STEM)';
    document.getElementById('res-condition').value = item.condition || 'Good';
    document.getElementById('res-exchange').value = item.exchange_type || 'Lend';
    document.getElementById('res-description').value = item.description || '';
    document.getElementById('res-available').checked = Boolean(item.is_available);

    const previewMap = [
      ['preview-front-cover', item.front_cover_path || item.image_url],
      ['preview-back-cover', item.back_cover_path],
      ['preview-spine', item.spine_path],
      ['preview-inside-pages', item.inside_pages_path]
    ];
    previewMap.forEach(([id, url]) => {
      const img = document.getElementById(id);
      if (img) {
        if (url) {
          img.src = url;
          img.classList.remove('hidden');
        } else {
          img.src = '';
          img.classList.add('hidden');
        }
      }
    });

    navigateTo('add-resource');
  } catch (err) {
    console.error('Error loading item for edit:', err);
  }
}

async function handleSaveResource(event) {
  event.preventDefault();
  const itemId = document.getElementById('res-id').value.trim();
  const file1 = document.getElementById('file-front-cover');
  const file2 = document.getElementById('file-back-cover');
  const submitBtn = document.getElementById('res-submit-btn');

  if (!itemId && (!file1?.files?.length || !file2?.files?.length)) {
    showToast('Dual-Photo Requirement: Both Slot 1 (1. Main Photo) and Slot 2 (2. Back / Side View) are mandatory.', true);
    return;
  }

  const form = document.getElementById('resource-form');
  const formData = new FormData(form);
  formData.set('id', itemId);
  formData.set('category', document.getElementById('res-category').value);
  formData.set('is_available', document.getElementById('res-available').checked ? 'true' : 'false');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (!(await prepareUploadFormData(formData))) {
      throw new Error('');
    }
    const res = await fetch('/api/items/add-or-edit', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save resource.');
    }

    showToast(data.message || 'Resource saved successfully!');
    navigateTo('my-listings');
  } catch (err) {
    if (err.message) showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = itemId ? 'Save Changes' : 'Publish Resource';
  }
}

function confirmDeleteItem(itemId) {
  openConfirmModal(
    'Are you sure you want to permanently delete this resource listing from ShareLoop?',
    'Delete Listing',
    () => executeDeleteItem(itemId)
  );
}

async function executeDeleteItem(itemId) {
  try {
    const res = await fetch(`/api/items/${itemId}/delete`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not delete listing.');
    }
    showToast(data.message || 'Listing removed from the platform.');
    if (currentUser && currentUser.role === 'Admin') {
      if (currentView === 'item-details') {
        navigateTo('admin-resources');
      } else {
        loadAdminResources();
      }
      loadAdminOverview();
    } else {
      navigateTo('my-listings');
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// --------------------------------------------------------------------------
// 9. EXCHANGE REQUESTS, MESSAGE THREAD LIFECYCLE & CANCELLATION BUTTON
// --------------------------------------------------------------------------
async function handleCreateExchangeRequest(itemId) {
  const notesEl = document.getElementById('detail-request-notes');
  const submitBtn = document.getElementById('detail-request-submit-btn');
  const notes = (notesEl?.value || '').trim();

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Request...';
  }

  try {
    const res = await fetch('/api/requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, notes })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not create request.');
    }

    showToast(data.message || 'Exchange request submitted!');
    await loadAllRequests();
    if (data.request && data.request.id) {
      await openRequestDetails(data.request.id);
    } else {
      navigateTo('my-requests');
    }
  } catch (err) {
    showToast(err.message, true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request This Resource';
    }
  }
}

async function loadAllRequests() {
  try {
    const res = await fetch('/api/requests');
    if (!res.ok) return;
    const data = await res.json();
    myRequestsList = data.my_requests || [];
    incomingRequestsList = data.incoming_requests || [];

    renderRequestsStack('my-requests-container', myRequestsList, 'outgoing');
    renderRequestsStack('incoming-requests-container', incomingRequestsList, 'incoming');
  } catch (err) {
    console.error('Error loading requests:', err);
  }
}

function getRequestStatusBadgeClass(status) {
  if (status === 'Accepted' || status === 'Handover') return 'badge-green';
  if (status === 'Pending') return 'badge-amber';
  if (status === 'Cancelled' || status === 'Declined') return 'badge-red';
  return 'badge-neutral';
}

function renderRequestsStack(containerId, list, mode) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No ${mode === 'outgoing' ? 'outgoing' : 'incoming'} requests yet</h3>
        <p>${mode === 'outgoing'
        ? 'Resources you request from Browse Exchange or broadcast on the Student Request Feed will appear here.'
        : 'When peers request your listings or when you respond to a Campus Feed broadcast, they will appear here.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(req => {
    const item = req.item || {};
    const partner = mode === 'outgoing' ? (req.owner || {}) : (req.requester || {});
    const partnerRoleLabel = mode === 'outgoing' ? 'Owner' : 'Requester';

    return `
      <div class="list-row-card">
        <img src="${escapeHtml(item.image_url || '')}" alt="${escapeHtml(item.title || 'Resource')}" class="list-row-thumb" />
        <div class="list-row-info">
          <div class="list-row-tags">
            <span class="mono-code">${escapeHtml(req.request_code)}</span>
            <span class="badge ${getExchangeBadgeClass(item.exchange_type || 'Lend')}">${escapeHtml(item.exchange_type || 'Lend')}</span>
            <span class="badge ${getRequestStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span>
            ${req.is_feed_transaction ? '<span class="badge badge-blue">Campus Feed Match</span>' : ''}
          </div>
          <h3>${escapeHtml(item.title || 'Requested Resource')}</h3>
          <p>${partnerRoleLabel}: <strong>${escapeHtml(partner.name || 'Campus Member')}</strong> • Updated ${escapeHtml(req.updated_time || req.created_at)}</p>
        </div>
        <div class="list-row-actions">
          <button type="button" class="btn-primary btn-sm" onclick="openRequestDetails(${req.id})">
            Open Tracker &amp; Chat &rarr;
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function openRequestDetails(reqId) {
  if (currentUser && currentUser.role === 'Admin') return;

  try {
    const res = await fetch(`/api/requests/${reqId}`);
    if (!res.ok) {
      showToast('Could not load transaction details.', true);
      return;
    }
    const data = await res.json();
    const req = data.request || data;
    currentInspectRequest = req;

    const backBtn = document.getElementById('request-details-back-btn');
    if (backBtn) {
      const targetDeck = (currentUser && req.requester_id === currentUser.id) ? 'my-requests' : 'incoming';
      backBtn.innerHTML = '&larr; Back to Requests';
      backBtn.onclick = () => navigateTo(targetDeck);
    }

    renderRequestDetails(req);

    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    const section = document.getElementById('view-request-details');
    if (section) section.classList.remove('hidden');
  } catch (err) {
    console.error('Error opening request details:', err);
  }
}

function renderRequestDetails(req) {
  const container = document.getElementById('request-details-container');
  if (!container || !currentUser || currentUser.role === 'Admin') return;

  const item = req.item || {};
  const requester = req.requester || {};
  const owner = req.owner || {};
  const isRequester = currentUser.id === req.requester_id;
  const isOwner = currentUser.id === req.owner_id;

  const step1Done = true;
  const step2Done = req.status === 'Accepted' || req.status === 'Handover';
  const step3Done = req.status === 'Handover';

  // Lifecycle Action Controls:
  // - Original Student Requester (`isRequester`): prominent Red action button labeled "Cancel Request"
  // - Owner (`isOwner`): Accept / Decline when Pending, Confirm Handover when Accepted
  let lifecycleButtonsHTML = '';
  if (req.status !== 'Handover' && req.status !== 'Cancelled' && req.status !== 'Declined') {
    const buttons = [];

    if (isOwner && req.status === 'Pending') {
      buttons.push(`
        <button type="button" class="btn-primary btn-sm" onclick="handleUpdateRequestStatus(${req.id}, 'Accepted')">
          Accept Request
        </button>
      `);
      buttons.push(`
        <button type="button" class="btn-danger btn-sm" onclick="handleUpdateRequestStatus(${req.id}, 'Declined')">
          Decline
        </button>
      `);
    }

    if ((isOwner || isRequester) && req.status === 'Accepted') {
      buttons.push(`
        <button type="button" class="btn-primary btn-sm" onclick="handleUpdateRequestStatus(${req.id}, 'Handover')">
          Confirm Handover Completed
        </button>
      `);
    }

    if (isRequester) {
      // Explicit requirement: If the active logged-in session user is the original student who posted
      // the broadcast feed item request (or requester), reveal a prominent Red action button labeled "Cancel Request"
      buttons.push(`
        <button type="button" id="btn-cancel-request" class="btn-danger btn-sm" onclick="cancelTransactionRequest(${req.id})">
          Cancel Request
        </button>
      `);
    }

    if (buttons.length > 0) {
      lifecycleButtonsHTML = `
        <div class="lifecycle-actions">
          ${buttons.join('')}
        </div>
      `;
    }
  }

  // Uploaded Proof Photos strip (when item has multiple proof photos)
  const proofPhotos = [
    item.front_cover_path || item.image_url,
    item.back_cover_path,
    item.spine_path,
    item.inside_pages_path
  ].filter(Boolean);

  const messages = req.messages || [];

  container.innerHTML = `
    <div class="req-header-bar">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <span class="mono-code">${escapeHtml(req.request_code)}</span>
          <span class="badge ${getRequestStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span>
          ${req.is_feed_transaction ? '<span class="badge badge-blue">Student Request Feed Transaction</span>' : ''}
        </div>
        <h2>${escapeHtml(item.title || 'Exchange Transaction')}</h2>
        <p>Requester: <strong>${escapeHtml(requester.name || 'Student')}</strong> &bull; Responder / Owner: <strong>${escapeHtml(owner.name || 'Owner')}</strong></p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-left">
        <div class="requested-item-summary">
          <img src="${escapeHtml(item.image_url || '')}" alt="${escapeHtml(item.title || '')}" />
          <div>
            <span class="badge ${getExchangeBadgeClass(item.exchange_type || 'Lend')}">${escapeHtml(item.exchange_type || 'Lend')}</span>
            <h3>${escapeHtml(item.title || '')}</h3>
            <p>${escapeHtml(item.category || '')} &bull; Condition: ${escapeHtml(item.condition || 'Good')}</p>
          </div>
        </div>

        ${proofPhotos.length > 1 ? `
          <div class="timeline-card">
            <h3>Uploaded Device Proof Photos</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
              ${proofPhotos.map((url, idx) => `
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display: block; border: 1px solid var(--line); border-radius: 10px; overflow: hidden;">
                  <img src="${escapeHtml(url)}" alt="Proof Photo ${idx + 1}" style="width: 100%; height: 110px; object-fit: cover; display: block;" />
                </a>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="timeline-card">
          <h3>Transaction Lifecycle</h3>
          <div class="timeline-steps">
            <div class="timeline-step ${step1Done ? 'done' : ''}">
              <div class="step-dot">1</div>
              <div>
                <strong>Request Initiated</strong>
                <p>Created on ${escapeHtml(req.created_time || req.created_at)}</p>
              </div>
            </div>
            <div class="timeline-step ${step2Done ? 'done' : ''}">
              <div class="step-dot">2</div>
              <div>
                <strong>Accepted &amp; Pickup Coordination</strong>
                <p>Agree on a campus meetup spot and time in the chat thread.</p>
              </div>
            </div>
            <div class="timeline-step ${step3Done ? 'done' : ''}">
              <div class="step-dot">3</div>
              <div>
                <strong>Physical Handover Complete</strong>
                <p>Both parties confirm the resource handover is complete.</p>
              </div>
            </div>
          </div>

          ${lifecycleButtonsHTML}
        </div>
      </div>

      <div class="detail-right">
        <div class="chat-card">
          <div class="chat-header">
            <h4>Pickup Coordination Chat</h4>
            <span class="badge badge-neutral">${messages.length} Message${messages.length === 1 ? '' : 's'}</span>
          </div>

          <div id="request-chat-messages" class="chat-messages-box">
            ${messages.length === 0 ? `
              <p class="text-muted" style="text-align: center; margin: auto;">No messages yet. Say hello to coordinate pickup!</p>
            ` : messages.map(msg => {
    const isMine = msg.sender_id === currentUser.id;
    return `
                <div class="chat-bubble-row ${isMine ? 'mine' : 'theirs'}">
                  <div class="chat-bubble">
                    <div class="chat-sender">${escapeHtml(msg.sender_name)}</div>
                    <div>${escapeHtml(msg.content)}</div>
                    <span class="chat-time">${escapeHtml(msg.timestamp)}</span>
                  </div>
                </div>
              `;
  }).join('')}
          </div>

          ${(req.status !== 'Cancelled' && req.status !== 'Declined' && req.status !== 'Handover') ? `
            <form class="chat-input-row" onsubmit="handleSendMessage(event, ${req.id})">
              <input
                type="text"
                id="request-chat-input"
                required
                placeholder="Write a message to coordinate pickup details..."
              />
              <button type="submit" class="btn-primary btn-sm">Send</button>
            </form>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  const chatBox = document.getElementById('request-chat-messages');
  if (chatBox) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

async function handleUpdateRequestStatus(reqId, newStatus) {
  try {
    const res = await fetch(`/api/requests/${reqId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not update request status.');
    }

    showToast(data.message || `Status updated to ${newStatus}.`);
    currentInspectRequest = data.request;
    renderRequestDetails(data.request);
    await loadAllRequests();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function cancelTransactionRequest(reqId) {
  try {
    const res = await fetch(`/api/requests/${reqId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to cancel request.');
    }

    // Update client state arrays cleanly
    if (Array.isArray(data.my_requests)) {
      myRequestsList = data.my_requests;
    }
    if (Array.isArray(data.incoming_requests)) {
      incomingRequestsList = data.incoming_requests;
    }

    renderRequestsStack('my-requests-container', myRequestsList, 'outgoing');
    renderRequestsStack('incoming-requests-container', incomingRequestsList, 'incoming');

    if (currentUser && currentUser.role === 'Student') {
      await loadFeedWorkspace();
    }

    showToast(data.message || 'Request cancelled and closed out.');
    // Transition single-page DOM focus smoothly back to core active request deck without reloading
    navigateTo('my-requests');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleSendMessage(event, reqId) {
  event.preventDefault();
  const input = document.getElementById('request-chat-input');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;

  input.value = '';
  try {
    const res = await fetch(`/api/requests/${reqId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not send message.');
    }

    if (data.request) {
      currentInspectRequest = data.request;
      renderRequestDetails(data.request);
    } else {
      await openRequestDetails(reqId);
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// --------------------------------------------------------------------------
// 10. PROFILE & ACCOUNT SECURITY HANDLERS
// --------------------------------------------------------------------------
function enforceDashboardNepaliPhone(inputEl) {
  let raw = inputEl.value;
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('(+977)')) {
    const afterPrefix = trimmed.slice(6).replace(/\D/g, '').slice(0, 10);
    inputEl.value = afterPrefix.length > 0 ? `(+977) ${afterPrefix}` : '(+977) ';
  } else if (trimmed.startsWith('+977')) {
    const afterPrefix = trimmed.slice(4).replace(/\D/g, '').slice(0, 10);
    inputEl.value = afterPrefix.length > 0 ? `(+977) ${afterPrefix}` : '(+977) ';
  } else {
    inputEl.value = raw.replace(/\D/g, '').slice(0, 10);
  }
}

async function handleUpdateProfile(event) {
  event.preventDefault();
  const name = document.getElementById('prof-name').value.trim();
  const email = document.getElementById('prof-email').value.trim().toLowerCase();
  const phone = document.getElementById('prof-phone').value.trim();
  const university = document.getElementById('prof-university').value.trim();

  if (!NEPALI_PHONE_DASH_REGEX.test(phone)) {
    showToast('Invalid phone number. Enter optional (+977) prefix followed by 10 digits.', true);
    return;
  }

  try {
    const res = await fetch('/api/profile/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, university })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile.');
    }

    currentUser = data.user;
    syncUserHeaderAndComposer();
    showToast(data.message || 'Personal details updated successfully.');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleChangePassword(event) {
  event.preventDefault();
  const current_password = document.getElementById('pw-current').value;
  const new_password = document.getElementById('pw-new').value;

  try {
    const res = await fetch('/api/profile/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not update password.');
    }

    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    showToast(data.message || 'Password updated successfully.');
  } catch (err) {
    showToast(err.message, true);
  }
}

function requestDeleteAccountConfirmation() {
  openConfirmModal(
    'Are you sure you want to permanently delete your ShareLoop account? This action cannot be undone.',
    'Delete Account',
    performDeleteAccount
  );
}

async function performDeleteAccount() {
  try {
    const res = await fetch('/api/profile/delete', { method: 'DELETE' });
    if (res.ok) {
      window.location.href = '/login';
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to delete account.', true);
    }
  } catch (err) {
    showToast('Network error while deleting account.', true);
  }
}

// --------------------------------------------------------------------------
// 11. ADMIN PORTAL: 5 DEDICATED MODULES & REACTIVE CHARTS
// --------------------------------------------------------------------------
async function loadAdminOverview() {
  const statsGrid = document.getElementById('admin-overview-stats-grid');
  if (!statsGrid) return;

  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) return;
    const data = await res.json();
    cachedAdminOverview = data;

    const stats = data.stats || {};
    const charts = data.charts || {};

    // 4 Core KPI Data Channel Cards
    statsGrid.innerHTML = `
      <div class="kpi-card">
        <span class="kpi-label">Total Platform Users</span>
        <strong class="kpi-value">${stats.total_platform_users ?? 0}</strong>
        <span class="kpi-sub">Active Students (${stats.student_count ?? 0}) + Approved Orgs (${stats.organization_count ?? 0})</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Resource Listings</span>
        <strong class="kpi-value">${stats.resource_listings ?? 0}</strong>
        <span class="kpi-sub">${stats.available_items ?? 0} Available &bull; ${stats.unavailable_items ?? 0} Unavailable</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Exchange Transactions</span>
        <strong class="kpi-value">${stats.exchange_transactions ?? 0}</strong>
        <span class="kpi-sub">Completed exchanges (status = Handover)</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Coordination Messages</span>
        <strong class="kpi-value">${stats.coordination_messages ?? 0}</strong>
        <span class="kpi-sub">Messages logged in Accepted requests</span>
      </div>
    `;

    // Populate Month Selector for "Exchanges Over Time"
    const monthSelect = document.getElementById('admin-chart-month-select');
    const timeline = charts.exchanges_over_time || {};
    const monthsList = timeline.months || [];
    if (monthSelect) {
      const prevSelected = monthSelect.value;
      monthSelect.innerHTML = `
        <option value="ALL">All Months</option>
        ${monthsList.map(m => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.label)}</option>`).join('')}
      `;
      if (prevSelected && (prevSelected === 'ALL' || monthsList.some(m => m.key === prevSelected))) {
        monthSelect.value = prevSelected;
      } else if (monthsList.length > 0) {
        monthSelect.value = monthsList[0].key;
      } else {
        monthSelect.value = 'ALL';
      }
      renderAdminLineChart(monthSelect.value);
    }

    renderAdminDoughnutChart(charts.exchange_types_breakdown || { Lend: 0, Donate: 0, Swap: 0 });
    renderAdminTopCategoriesChart(charts.top_categories_shared || []);
  } catch (err) {
    console.error('Error loading admin overview:', err);
  }
}

function handleOverviewMonthChange(monthKey) {
  renderAdminLineChart(monthKey);
}

function renderAdminLineChart(selectedMonthKey) {
  const container = document.getElementById('admin-line-chart-container');
  if (!container || !cachedAdminOverview) return;

  const timeline = (cachedAdminOverview.charts && cachedAdminOverview.charts.exchanges_over_time) || {};
  const weekLabels = timeline.week_labels || ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  let counts = [0, 0, 0, 0];

  if (!selectedMonthKey || selectedMonthKey === 'ALL') {
    counts = timeline.all_months_weeks || [0, 0, 0, 0];
  } else {
    const foundMonth = (timeline.months || []).find(m => m.key === selectedMonthKey);
    if (foundMonth && Array.isArray(foundMonth.weeks)) {
      counts = foundMonth.weeks;
    }
  }

  const maxVal = Math.max(4, ...counts);
  const width = 520;
  const height = 210;
  const padLeft = 40;
  const padRight = 26;
  const padTop = 24;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const coords = counts.map((val, idx) => {
    const x = padLeft + (counts.length > 1 ? (idx / (counts.length - 1)) * plotW : plotW / 2);
    const y = padTop + plotH - (val / maxVal) * plotH;
    return { x, y, val, label: weekLabels[idx] || `Week ${idx + 1}` };
  });

  const polylinePoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPoints = `${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ${polylinePoints} ${coords[coords.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)}`;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const gridLines = yTicks.map(tick => {
    const y = padTop + plotH - (tick / maxVal) * plotH;
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#E3E7EC" stroke-dasharray="2 6" stroke-linecap="round" stroke-width="1" />
      <text x="${padLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#7E8696" font-size="11" font-weight="600">${tick}</text>
    `;
  }).join('');

  const pointsSVG = coords.map(c => `
    <g>
      <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5.5" fill="#FFFFFF" stroke="#10151D" stroke-width="2.5" />
      <text x="${c.x.toFixed(1)}" y="${(c.y - 10).toFixed(1)}" text-anchor="middle" fill="#10151D" font-size="12" font-weight="700">${c.val}</text>
      <text x="${c.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#48505F" font-size="11" font-weight="600">${escapeHtml(c.label)}</text>
    </g>
  `).join('');

  const totalHandovers = counts.reduce((a, b) => a + b, 0);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="admin-line-svg" role="img" aria-label="Exchanges Over Time">
      <defs>
        <linearGradient id="lineAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2E6B39" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#2E6B39" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      <polygon points="${areaPoints}" fill="url(#lineAreaFill)" />
      <polyline fill="none" stroke="#2E6B39" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
      ${pointsSVG}
    </svg>
    <div class="admin-chart-footer-meta">
      Completed Handovers in Period: <strong>${totalHandovers}</strong>
    </div>
  `;
}

function renderAdminDoughnutChart(breakdown) {
  const container = document.getElementById('admin-doughnut-chart-container');
  if (!container) return;

  const lend = Number(breakdown.Lend || 0);
  const donate = Number(breakdown.Donate || 0);
  const swap = Number(breakdown.Swap || 0);
  const total = lend + donate + swap;

  const slices = [
    { label: 'Lend', count: lend, color: '#5B8FC7' },
    { label: 'Donate', count: donate, color: '#2E6B39' },
    { label: 'Swap', count: swap, color: '#E2A54B' }
  ];

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const circles = total > 0
    ? slices.map(s => {
      if (s.count <= 0) return '';
      const dash = (s.count / total) * circumference;
      const gap = circumference - dash;
      const currentOffset = -offset;
      offset += dash;
      return `
          <circle
            cx="85"
            cy="85"
            r="${radius}"
            fill="transparent"
            stroke="${s.color}"
            stroke-width="24"
            stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
            stroke-dashoffset="${currentOffset.toFixed(2)}"
            transform="rotate(-90 85 85)"
          />
        `;
    }).join('')
    : `<circle cx="85" cy="85" r="${radius}" fill="transparent" stroke="#ECEFF3" stroke-width="24" />`;

  container.innerHTML = `
    <div class="doughnut-layout">
      <div class="doughnut-svg-wrap">
        <svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="Exchange Types Breakdown">
          ${circles}
          <text x="85" y="81" text-anchor="middle" fill="#10151D" font-size="30" font-weight="650" letter-spacing="-1">${total}</text>
          <text x="85" y="99" text-anchor="middle" fill="#7E8696" font-size="11" font-weight="600">Active Items</text>
        </svg>
      </div>
      <div class="doughnut-legend">
        ${slices.map(s => {
    const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
    return `
            <div class="doughnut-legend-item">
              <span class="doughnut-legend-swatch" style="background: ${s.color};"></span>
              <div class="doughnut-legend-text">
                <span class="doughnut-legend-label">${escapeHtml(s.label)}</span>
                <span class="doughnut-legend-val"><strong>${s.count}</strong> (${pct}%)</span>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function renderAdminTopCategoriesChart(categories) {
  const container = document.getElementById('admin-top-categories-container');
  if (!container) return;

  if (!categories || categories.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No active resource listings to categorize.</p></div>`;
    return;
  }

  const maxCount = Math.max(1, ...categories.map(c => c.count || 0));
  container.innerHTML = categories.map(cat => {
    const widthPct = Math.max(6, Math.round(((cat.count || 0) / maxCount) * 100));
    return `
      <div class="category-bar-row">
        <div class="category-bar-header">
          <span class="category-bar-name">${escapeHtml(cat.category)}</span>
          <span class="category-bar-stats"><strong>${cat.count}</strong> listing${cat.count === 1 ? '' : 's'} (${cat.percentage ?? 0}%)</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width: ${widthPct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// --- Admin View 2: Resource Feed Moderation ---
function filterAdminSidebarCategoryList(query) {
  const scrollbox = document.getElementById('admin-filter-category-scrollbox');
  if (!scrollbox) return;
  const q = (query || '').trim().toLowerCase();

  scrollbox.querySelectorAll('.category-filter-group').forEach(group => {
    let visibleCount = 0;
    group.querySelectorAll('.category-filter-item').forEach(item => {
      const label = (item.dataset.label || item.textContent || '').toLowerCase();
      if (!q || label.includes(q)) {
        item.style.display = 'flex';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });
    group.style.display = visibleCount > 0 ? 'block' : 'none';
  });
}

function resetAdminResourceFilters() {
  document.querySelectorAll('.admin-filter-exchange, .admin-filter-category, .admin-filter-condition').forEach(cb => {
    cb.checked = false;
  });
  const availOnly = document.getElementById('admin-filter-available-only');
  if (availOnly) availOnly.checked = false;

  const searchInput = document.getElementById('admin-filter-category-search');
  if (searchInput) {
    searchInput.value = '';
    filterAdminSidebarCategoryList('');
  }
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) globalSearch.value = '';

  loadAdminResources();
}

async function loadAdminResources() {
  const container = document.getElementById('admin-resources-container');
  if (!container) return;

  const search = (document.getElementById('global-search-input')?.value || '').trim();
  const exchanges = Array.from(document.querySelectorAll('.admin-filter-exchange:checked')).map(el => el.value);
  const categories = Array.from(document.querySelectorAll('.admin-filter-category:checked')).map(el => el.value);
  const conditions = Array.from(document.querySelectorAll('.admin-filter-condition:checked')).map(el => el.value);
  const availableOnly = document.getElementById('admin-filter-available-only')?.checked ?? false;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (exchanges.length) params.set('exchange_types', exchanges.join(','));
  if (categories.length) params.set('categories', categories.join('||'));
  if (conditions.length) params.set('conditions', conditions.join(','));
  if (availableOnly) params.set('available_only', 'true');

  try {
    const res = await fetch(`/api/admin/resources?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    const resources = data.resources || data.items || [];

    if (resources.length === 0) {
      container.innerHTML = `<div class="empty-state"><h3>No matching listings</h3><p>Try clearing some filters in the right panel.</p></div>`;
      return;
    }

    // Strictly two action buttons: "Inspect" and "Delete" (No "Mark Available" button)
    container.innerHTML = resources.map(item => {
      const owner = item.owner || {};
      return `
        <div class="list-row-card">
          <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="list-row-thumb" />
          <div class="list-row-info">
            <div class="list-row-tags">
              <span class="course-tag">${escapeHtml(item.course_code || 'GEN 101')}</span>
              <span class="badge ${getExchangeBadgeClass(item.exchange_type)}">${escapeHtml(item.exchange_type)}</span>
              <span class="badge badge-neutral">${escapeHtml(item.condition)}</span>
              <span class="status-pill ${item.is_available ? 'available' : 'unavailable'}">
                ${item.is_available ? 'Available' : 'Unavailable'}
              </span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.category)} &bull; Owner: <strong>${escapeHtml(owner.name || 'Student')}</strong> (${escapeHtml(owner.role || 'Student')})</p>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn-outline btn-sm" onclick="openItemDetails(${item.id}, 'admin-resources')">Inspect</button>
            <button type="button" class="btn-danger btn-sm" onclick="confirmDeleteItem(${item.id})">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading admin resources:', err);
  }
}

// --- Admin View 3: Transactions & Status Filter Tags ---
function selectAdminTransactionStatusFilter(status) {
  selectedAdminTxStatus = status || 'All';
  document.querySelectorAll('#admin-tx-status-filters .status-filter-tag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === selectedAdminTxStatus);
  });
  loadAdminTransactions();
}

async function loadAdminTransactions() {
  const container = document.getElementById('admin-transactions-container');
  if (!container) return;

  const params = new URLSearchParams();
  if (selectedAdminTxStatus && selectedAdminTxStatus !== 'All') {
    params.set('status', selectedAdminTxStatus);
  }

  try {
    const res = await fetch(`/api/admin/transactions?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    const txs = data.transactions || data.requests || [];

    if (txs.length === 0) {
      container.innerHTML = `<div class="empty-state"><h3>No matching transactions</h3><p>No exchange requests match the "${escapeHtml(selectedAdminTxStatus)}" status filter.</p></div>`;
      return;
    }

    container.innerHTML = txs.map(req => {
      const item = req.item || {};
      const requester = req.requester || {};
      const owner = req.owner || {};
      return `
        <div class="list-row-card">
          <img src="${escapeHtml(item.image_url || '')}" alt="${escapeHtml(item.title || '')}" class="list-row-thumb" />
          <div class="list-row-info">
            <div class="list-row-tags">
              <span class="mono-code">${escapeHtml(req.request_code)}</span>
              <span class="badge ${getExchangeBadgeClass(item.exchange_type || 'Lend')}">${escapeHtml(item.exchange_type || 'Lend')}</span>
              <span class="badge ${getRequestStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span>
            </div>
            <h3>${escapeHtml(item.title || 'Resource Transaction')}</h3>
            <p>Requester: <strong>${escapeHtml(requester.name || 'Student')}</strong> &rarr; Owner: <strong>${escapeHtml(owner.name || 'Owner')}</strong> &bull; ${escapeHtml(req.created_at)}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading admin transactions:', err);
  }
}

// --- Admin View 4: Registered / Active Accounts (Instantaneous Client-Side Role Toggle: Student vs Organization) ---
function selectAdminActiveAccountRoleFilter(role) {
  selectedActiveAccountRoleFilter = role === 'Organization' ? 'Organization' : 'Student';
  document.querySelectorAll('#admin-active-role-toggle .status-filter-tag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === selectedActiveAccountRoleFilter);
  });
  renderAdminActiveAccountsList();
}

function renderAdminActiveAccountsList() {
  const container = document.getElementById('admin-active-accounts-list');
  if (!container) return;

  const filteredAccounts = (cachedAdminActiveAccounts || []).filter(acc => {
    if (selectedActiveAccountRoleFilter === 'Organization') {
      return acc.role === 'Organization' && acc.is_approved !== false;
    }
    return acc.role === 'Student';
  });

  if (filteredAccounts.length === 0) {
    const roleLabel = selectedActiveAccountRoleFilter === 'Organization' ? 'verified organization' : 'registered student';
    container.innerHTML = `<div class="empty-state"><h3>No ${escapeHtml(roleLabel)} accounts found</h3></div>`;
    return;
  }

  container.innerHTML = filteredAccounts.map(acc => `
    <div class="list-row-card">
      <div class="avatar-circle lg">${escapeHtml(acc.initials || 'U')}</div>
      <div class="list-row-info">
        <div class="list-row-tags">
          <span class="badge ${acc.role === 'Organization' ? 'badge-amber' : 'badge-green'}">${escapeHtml(acc.role)}</span>
          <span class="status-pill available">● Active</span>
        </div>
        <h3>${escapeHtml(acc.name)}</h3>
        <p>${escapeHtml(acc.email)} ${acc.phone ? '&bull; ' + escapeHtml(acc.phone) : ''} ${acc.dob ? '&bull; DOB: ' + escapeHtml(acc.dob) : ''}</p>
      </div>
      <div class="list-row-actions" style="display: flex; align-items: center; gap: 0.85rem;">
        <span class="text-muted">Joined ${escapeHtml(acc.created_at)}</span>
        <button type="button" class="btn-danger btn-sm" onclick="confirmAdminDeleteAccount(${acc.id}, '${escapeAttr(acc.name)}')">
          Remove User
        </button>
      </div>
    </div>
  `).join('');
}

function confirmAdminDeleteAccount(userId, userName) {
  openConfirmModal(
    `Are you sure you want to permanently remove the account for "${userName}"? All associated listings and requests will be deleted.`,
    'Remove User',
    () => performAdminDeleteAccount(userId, userName)
  );
}

async function performAdminDeleteAccount(userId, userName) {
  try {
    const res = await fetch(`/api/admin/accounts/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to remove user account.', true);
      return;
    }
    showToast(data.message || `Account for "${userName}" has been removed.`);
    await loadAdminActiveAccounts();
    await loadAdminOverview();
  } catch (err) {
    showToast(err.message || 'Error removing account.', true);
  }
}

async function loadAdminActiveAccounts() {
  const container = document.getElementById('admin-active-accounts-list');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/accounts/active');
    if (!res.ok) return;
    const data = await res.json();
    cachedAdminActiveAccounts = data.accounts || data.users || [];

    // Ensure toggle button active state matches selectedActiveAccountRoleFilter
    document.querySelectorAll('#admin-active-role-toggle .status-filter-tag').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === selectedActiveAccountRoleFilter);
    });

    renderAdminActiveAccountsList();
  } catch (err) {
    console.error('Error loading active accounts:', err);
  }
}

// --- Admin View 5: Pending Organization Approvals ("Approve Account" Green & "Cancel Request" Red) ---
async function loadAdminPendingAccountsBadgeOnly() {
  try {
    const res = await fetch('/api/admin/accounts/pending');
    if (!res.ok) return;
    const data = await res.json();
    const pending = data.accounts || data.users || [];
    updateSidebarPendingBadge(pending.length);
  } catch (err) {
    // ignore
  }
}

function updateSidebarPendingBadge(count) {
  const badge = document.getElementById('sidebar-pending-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function loadAdminPendingAccounts() {
  const container = document.getElementById('admin-pending-accounts-list');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/accounts/pending');
    if (!res.ok) return;
    const data = await res.json();
    const pending = data.accounts || data.users || [];

    updateSidebarPendingBadge(pending.length);

    if (pending.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Pending Organization Registrations</h3>
          <p>All incoming organization registration requests have been reviewed.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pending.map(org => `
      <div class="list-row-card">
        <div class="avatar-circle lg">${escapeHtml(org.initials || 'OR')}</div>
        <div class="list-row-info">
          <div class="list-row-tags">
            <span class="badge badge-amber">Organization</span>
            <span class="badge badge-neutral">Domain: @${escapeHtml(org.email_domain)}</span>
            <span class="badge badge-amber">Status: Pending Verification</span>
          </div>
          <h3>${escapeHtml(org.name)}</h3>
          <p>${escapeHtml(org.email)} ${org.phone ? '&bull; ' + escapeHtml(org.phone) : ''} &bull; Registered ${escapeHtml(org.registered_at || org.created_at)}</p>
        </div>
        <div class="list-row-actions">
          <button type="button" class="btn-approve-green btn-sm" onclick="handleOrganizationApprovalDecision(${org.id}, 'Approve')">
            Approve Account
          </button>
          <button type="button" class="btn-danger btn-sm" onclick="handleOrganizationApprovalDecision(${org.id}, 'Reject')">
            Cancel Request
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading pending organization accounts:', err);
  }
}

async function handleOrganizationApprovalDecision(userId, decision) {
  try {
    const res = await fetch(`/api/admin/accounts/decision/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not process decision.');
    }

    showToast(data.message || 'Organization account updated.');
    await loadAdminPendingAccounts();
    await loadAdminActiveAccounts();
    await loadAdminOverview();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --------------------------------------------------------------------------
// 12. ESCAPING UTILITIES
// --------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

// --------------------------------------------------------------------------
// 13. ORGANIZATION NEEDS BROADCASTS & DISASTER RELIEF LOGISTICS ENGINE
// --------------------------------------------------------------------------
let cachedOrgBroadcasts = [];
let cachedFeedOrgBroadcasts = [];
let selectedBroadcastMode = 'crisis_shelter';
let editingBroadcastId = null;
let activeRecordBroadcast = null;
let recordPageReturnView = 'org-broadcasts';

const PRESET_BROADCAST_TEMPLATES = {
  crisis_shelter: {
    title: 'Displaced Children CFS & Psychosocial Relief Drive',
    desc: 'Immediate emergency child-friendly learning kits, picture books, and games for displaced children in temporary shelter camps.',
    items: (count) => [
      { age_bracket: 'Ages 3–6 (Early Childhood)', item_name: 'Storybooks & Picture Books (Nepali & English)', quantity_needed: Math.max(5, Math.round(count * 0.4)), unit: 'books' },
      { age_bracket: 'Ages 7–11 (Primary Years)', item_name: 'Drawing Pads, Pencils & Coloring Markers', quantity_needed: Math.max(5, Math.round(count * 0.4)), unit: 'sets' },
      { age_bracket: 'Ages 12–17 (Adolescents & Youth)', item_name: 'Expressive Writing Journals & Ballpoint Pens', quantity_needed: Math.max(5, Math.round(count * 0.3)), unit: 'sets' }
    ]
  },
  crisis_school: {
    title: 'Emergency School Restoration & Curriculum Recovery Drive',
    desc: 'Replacing damaged curriculum textbooks, exercise notebooks, and essential school supplies for disaster-impacted schools.',
    items: (count) => [
      { age_bracket: 'Class 1–10 (Core Curriculum)', item_name: 'Curriculum Textbooks (Govt / CDC Curriculum)', quantity_needed: Math.max(10, Math.round(count * 1.5)), unit: 'books' },
      { age_bracket: 'All Students', item_name: 'Exercise Notebooks (Ruled, Grid & Plain)', quantity_needed: Math.max(20, Math.round(count * 3.0)), unit: 'notebooks' },
      { age_bracket: 'All Students', item_name: 'Stationery Kits (Geometry Box, Pens, Pencils, Erasers)', quantity_needed: Math.max(10, count), unit: 'kits' },
      { age_bracket: 'All Students', item_name: 'Sturdy Waterproof School Backpacks', quantity_needed: Math.max(5, Math.round(count * 0.8)), unit: 'backpacks' }
    ]
  },
  seasonal_drive: {
    title: 'Winter Educational Book Drive & Warm Study Supplies',
    desc: 'Seasonal collection of reference books, winter storybooks, and writing supplies for underprivileged students.',
    items: (count) => [
      { age_bracket: 'General Education', item_name: 'Winter Story & Literature Book Bundles', quantity_needed: Math.max(10, Math.round(count * 0.8)), unit: 'bundles' },
      { age_bracket: 'General Education', item_name: 'Writing Notebooks & Stationery Bundles', quantity_needed: Math.max(10, count), unit: 'packs' }
    ]
  },
  ongoing: {
    title: 'Community Learning Library & Rural Tutoring Hub Support',
    desc: 'Sustained community library development and permanent reference material collection.',
    items: (count) => [
      { age_bracket: 'Children Section', item_name: 'Children Literature & Illustrated Storybooks', quantity_needed: Math.max(10, Math.round(count * 0.6)), unit: 'books' },
      { age_bracket: 'Community Library', item_name: 'English & Nepali Reference Dictionaries & Encyclopedias', quantity_needed: Math.max(2, Math.round(count * 0.15)), unit: 'books' }
    ]
  }
};

const SUGGESTED_CHIPS_BY_MODE = {
  crisis_shelter: [
    { age_bracket: 'Ages 3–6 (Early Childhood)', item_name: 'Coloring Books & Crayon Sets', quantity: 20, unit: 'sets' },
    { age_bracket: 'Ages 7–11 (Primary Years)', item_name: 'Board Games (Ludo, Chess, Snakes & Ladders)', quantity: 8, unit: 'games' },
    { age_bracket: 'Ages 12–17 (Adolescents & Youth)', item_name: 'Adolescent Fiction & Science Books', quantity: 15, unit: 'books' }
  ],
  crisis_school: [
    { age_bracket: 'All Students', item_name: 'Waterproof School Backpacks', quantity: 25, unit: 'backpacks' },
    { age_bracket: 'Class 6–10 (Secondary)', item_name: 'Geometry & Instrument Boxes', quantity: 25, unit: 'boxes' }
  ],
  seasonal_drive: [
    { age_bracket: 'General', item_name: 'Winter Storybooks Bundle', quantity: 30, unit: 'bundles' }
  ],
  ongoing: [
    { age_bracket: 'General', item_name: 'Children Literature & Illustrated Books', quantity: 20, unit: 'books' }
  ]
};

function openOrgBroadcastModal() {
  editingBroadcastId = null;
  const editIdInput = document.getElementById('org-broadcast-edit-id');
  if (editIdInput) editIdInput.value = '';
  navigateTo('org-create-broadcast');
}

function closeOrgBroadcastModal() {
  editingBroadcastId = null;
  const editIdInput = document.getElementById('org-broadcast-edit-id');
  if (editIdInput) editIdInput.value = '';
  navigateTo('org-broadcasts');
}

function initOrgCreateBroadcastView() {
  if (editingBroadcastId) {
    // Mode and fields are already set up by openOrgEditBroadcast
    return;
  }

  const titleEl = document.getElementById('org-broadcast-page-title');
  const subtitleEl = document.getElementById('org-broadcast-page-subtitle');
  const submitBtnText = document.getElementById('org-broadcast-submit-btn-text');
  const editIdInput = document.getElementById('org-broadcast-edit-id');

  if (titleEl) titleEl.textContent = 'Create Needs Broadcast';
  if (subtitleEl) subtitleEl.textContent = 'Broadcast emergency community relief needs or ongoing project drives directly to university students on campus.';
  if (submitBtnText) submitBtnText.textContent = 'Publish Needs Broadcast';
  if (editIdInput) editIdInput.value = '';

  selectedBroadcastMode = 'crisis_shelter';

  const countInput = document.getElementById('org-beneficiary-count');
  if (countInput && (!countInput.value || parseInt(countInput.value, 10) < 1)) {
    countInput.value = '50';
  }

  handleBroadcastModeChange('crisis_shelter');
}

async function openOrgEditBroadcast(broadcastId) {
  const allBroadcasts = [...cachedOrgBroadcasts, ...cachedFeedOrgBroadcasts];
  let b = allBroadcasts.find(x => x.id === broadcastId);
  if (!b) {
    try {
      const res = await fetch(`/api/org/broadcasts/${broadcastId}`);
      if (res.ok) {
        const data = await res.json();
        b = data.broadcast;
      }
    } catch (err) {
      console.error('Error fetching broadcast for editing:', err);
    }
  }
  if (!b) {
    showToast('Broadcast not found.', true);
    return;
  }

  editingBroadcastId = broadcastId;

  const titleEl = document.getElementById('org-broadcast-page-title');
  const subtitleEl = document.getElementById('org-broadcast-page-subtitle');
  const submitBtnText = document.getElementById('org-broadcast-submit-btn-text');
  const editIdInput = document.getElementById('org-broadcast-edit-id');

  if (titleEl) titleEl.textContent = 'Edit Needs Broadcast';
  if (subtitleEl) subtitleEl.textContent = 'Update logistics, beneficiary count, or needed supplies for this drive.';
  if (submitBtnText) submitBtnText.textContent = 'Save Broadcast Changes';
  if (editIdInput) editIdInput.value = broadcastId;

  selectedBroadcastMode = b.urgency_mode || 'crisis_shelter';
  document.querySelectorAll('.urgency-mode-card').forEach(card => card.classList.remove('active'));
  const activeCard = document.getElementById(`mode-card-${selectedBroadcastMode}`);
  if (activeCard) activeCard.classList.add('active');
  const radio = document.querySelector(`input[name="broadcast_urgency_mode"][value="${selectedBroadcastMode}"]`);
  if (radio) radio.checked = true;

  const titleInput = document.getElementById('org-broadcast-title');
  const descInput = document.getElementById('org-broadcast-desc');
  const countInput = document.getElementById('org-beneficiary-count');
  const roadSelect = document.getElementById('org-broadcast-road');
  const locInput = document.getElementById('org-broadcast-location');
  const dropInput = document.getElementById('org-broadcast-drop-point');

  if (titleInput) titleInput.value = b.title || '';
  if (descInput) descInput.value = b.description || '';
  if (countInput) countInput.value = b.beneficiary_count || 50;
  if (roadSelect) roadSelect.value = b.road_condition || 'Motorable';
  if (locInput) locInput.value = b.location || '';
  if (dropInput) dropInput.value = b.safe_drop_point || '';

  const tbody = document.getElementById('org-broadcast-items-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    (b.items || []).forEach(it => {
      addCustomItemRowToBroadcastBuilder(it.age_bracket, it.item_name, it.quantity_needed, it.unit, it.id, it.quantity_secured);
    });
  }

  renderSuggestionPills(selectedBroadcastMode);
  navigateTo('org-create-broadcast');
}

function handleBroadcastModeChange(mode) {
  selectedBroadcastMode = mode;
  document.querySelectorAll('.urgency-mode-card').forEach(card => card.classList.remove('active'));
  const activeCard = document.getElementById(`mode-card-${mode}`);
  if (activeCard) activeCard.classList.add('active');

  const radio = document.querySelector(`input[name="broadcast_urgency_mode"][value="${mode}"]`);
  if (radio) radio.checked = true;

  const titleInput = document.getElementById('org-broadcast-title');
  const descInput = document.getElementById('org-broadcast-desc');
  const template = PRESET_BROADCAST_TEMPLATES[mode];
  if (template) {
    if (titleInput && (!titleInput.value || titleInput.value.includes('Relief') || titleInput.value.includes('Drive') || titleInput.value.includes('Support') || titleInput.value.includes('CFS') || titleInput.value.includes('Hub') || titleInput.value.includes('Library') || titleInput.value.includes('Restoration'))) {
      titleInput.value = template.title;
    }
    if (descInput && (!descInput.value || descInput.value.includes('emergency') || descInput.value.includes('collection') || descInput.value.includes('support') || descInput.value.includes('kits') || descInput.value.includes('displaced') || descInput.value.includes('curriculum') || descInput.value.includes('library') || descInput.value.includes('Replacing') || descInput.value.includes('Seasonal'))) {
      descInput.value = template.desc;
    }
  }

  // Populate recommended items and quick-add pills for the selected mode
  resetBroadcastItemsToSuggestions();
}

function handleBeneficiaryCountInput() {
  const countInput = document.getElementById('org-beneficiary-count');
  if (!countInput) return;
  let val = parseInt(countInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 100000) val = 100000;
  countInput.value = val;
  renderSuggestionPills(selectedBroadcastMode);
}

function handleBeneficiaryCountChange() {
  handleBeneficiaryCountInput();
}

function resetBroadcastItemsToSuggestions() {
  const tbody = document.getElementById('org-broadcast-items-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const countInput = document.getElementById('org-beneficiary-count');
  const count = parseInt(countInput ? countInput.value : 50, 10) || 50;
  const template = PRESET_BROADCAST_TEMPLATES[selectedBroadcastMode] || PRESET_BROADCAST_TEMPLATES.crisis_shelter;
  const items = template.items(count);

  items.forEach(item => {
    addCustomItemRowToBroadcastBuilder(item.age_bracket, item.item_name, item.quantity_needed, item.unit);
  });

  renderSuggestionPills(selectedBroadcastMode);
}

function renderSuggestionPills(mode) {
  const container = document.getElementById('broadcast-suggestions-pills');
  if (!container) return;

  const chips = SUGGESTED_CHIPS_BY_MODE[mode] || SUGGESTED_CHIPS_BY_MODE.crisis_shelter || [];
  if (!chips.length) {
    container.innerHTML = '<span style="font-size: 0.8rem; color: var(--ink-3);">Use the "+ Add Custom Item" button below to add custom items.</span>';
    return;
  }

  container.innerHTML = chips.map((item, idx) => `
    <button
      type="button"
      class="suggestion-chip-btn"
      onclick="addSuggestedItemFromChip('${mode}', ${idx})"
      title="Click to add '${escapeAttr(item.item_name)}' to needed supplies list"
    >
      <span>+ ${escapeHtml(item.item_name)}</span>
      <span style="opacity: 0.65; font-size: 0.72rem;">(${item.quantity} ${escapeHtml(item.unit)})</span>
    </button>
  `).join('');
}

function addSuggestedItemFromChip(mode, idx) {
  const chips = SUGGESTED_CHIPS_BY_MODE[mode] || SUGGESTED_CHIPS_BY_MODE[selectedBroadcastMode] || [];
  const item = chips[idx];
  if (!item) return;

  addCustomItemRowToBroadcastBuilder(item.age_bracket, item.item_name, item.quantity, item.unit);
  showToast(`Added "${item.item_name}" to needed supplies list`);
}

function applySelectedPresetTemplate() {
  resetBroadcastItemsToSuggestions();
}

const STANDARD_BRACKETS = [
  'Ages 3–6 (Early Childhood)',
  'Ages 7–11 (Primary Years)',
  'Ages 12–17 (Adolescents & Youth)',
  'Class 1–5 (Primary)',
  'Class 6–10 (Secondary)',
  'All Students',
  'General'
];

function findMatchingStandardBracket(val) {
  if (!val) return '';
  const cleanVal = val.replace(/–/g, '-').trim().toLowerCase();
  for (const b of STANDARD_BRACKETS) {
    if (b.replace(/–/g, '-').trim().toLowerCase() === cleanVal) {
      return b;
    }
  }
  if (cleanVal.includes('3-6') || cleanVal.includes('3–6')) return 'Ages 3–6 (Early Childhood)';
  if (cleanVal.includes('7-11') || cleanVal.includes('7–11')) return 'Ages 7–11 (Primary Years)';
  if (cleanVal.includes('12-17') || cleanVal.includes('12–17')) return 'Ages 12–17 (Adolescents & Youth)';
  if (cleanVal.includes('1-5') || cleanVal.includes('1–5')) return 'Class 1–5 (Primary)';
  if (cleanVal.includes('6-10') || cleanVal.includes('6–10')) return 'Class 6–10 (Secondary)';
  if (cleanVal.includes('all student')) return 'All Students';
  if (cleanVal.includes('general')) return 'General';
  return '';
}

function handleBracketSelectChange(selectEl) {
  const container = selectEl.closest('td') || selectEl.parentElement;
  const customInput = container.querySelector('.item-bracket-custom-input');
  if (!customInput) return;
  if (selectEl.value === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

function addCustomItemRowToBroadcastBuilder(bracket = '', name = '', qty = 10, unit = 'books', itemId = null, quantitySecured = 0) {
  const tbody = document.getElementById('org-broadcast-items-tbody');
  if (!tbody) return;

  const safeBracket = bracket || '';
  const safeName = name || '';
  const safeQty = parseInt(qty, 10) || 10;
  const safeUnit = unit || 'books';

  const matchedBracket = findMatchingStandardBracket(safeBracket);
  const isCustom = !matchedBracket && Boolean(safeBracket);
  const selectedSelectValue = matchedBracket ? matchedBracket : (isCustom ? '__custom__' : 'Ages 3–6 (Early Childhood)');

  const tr = document.createElement('tr');
  tr.className = 'broadcast-item-row';
  if (itemId) tr.dataset.itemId = itemId;
  if (quantitySecured) tr.dataset.secured = quantitySecured;

  tr.innerHTML = `
    <td style="padding: 0.5rem 0.6rem; vertical-align: top;">
      <select class="form-control item-bracket-select" onchange="handleBracketSelectChange(this)" style="font-size: 0.82rem; padding: 0.35rem 0.5rem; width: 100%; box-sizing: border-box; cursor: pointer;">
        <option value="Ages 3–6 (Early Childhood)">Ages 3–6 (Early Childhood)</option>
        <option value="Ages 7–11 (Primary Years)">Ages 7–11 (Primary Years)</option>
        <option value="Ages 12–17 (Adolescents & Youth)">Ages 12–17 (Adolescents & Youth)</option>
        <option value="Class 1–5 (Primary)">Class 1–5 (Primary)</option>
        <option value="Class 6–10 (Secondary)">Class 6–10 (Secondary)</option>
        <option value="All Students">All Students</option>
        <option value="General">General</option>
        <option value="__custom__">Custom / Type own...</option>
      </select>
      <input
        type="text"
        class="form-control item-bracket-custom-input"
        list="bracket-datalist"
        value="${escapeAttr(isCustom ? safeBracket : '')}"
        placeholder="Type custom category..."
        style="display: ${isCustom ? 'block' : 'none'}; margin-top: 5px; font-size: 0.8rem; padding: 0.3rem 0.45rem; width: 100%; box-sizing: border-box;"
      />
    </td>
    <td style="padding: 0.5rem 0.6rem; vertical-align: top;">
      <input type="text" class="form-control item-name-input" value="${escapeAttr(safeName)}" placeholder="Item description / supply name (write what you need)" style="font-size: 0.82rem; padding: 0.35rem 0.5rem; width: 100%; box-sizing: border-box;" required />
    </td>
    <td style="padding: 0.5rem 0.6rem; vertical-align: top;">
      <input type="number" class="form-control item-qty-input" value="${safeQty}" min="1" max="100000" style="font-size: 0.82rem; padding: 0.35rem 0.5rem; text-align: right; font-weight: 700; width: 100%; box-sizing: border-box;" required />
    </td>
    <td style="padding: 0.5rem 0.6rem; vertical-align: top;">
      <input type="text" class="form-control item-unit-input" list="unit-datalist" value="${escapeAttr(safeUnit)}" placeholder="books, sets, kits" style="font-size: 0.82rem; padding: 0.35rem 0.5rem; width: 100%; box-sizing: border-box;" required />
    </td>
    <td style="padding: 0.5rem 0.4rem; text-align: center; vertical-align: top;">
      <button type="button" class="btn-outline btn-sm" onclick="removeBroadcastItemRow(this)" style="color: var(--danger); border-color: var(--danger-line); padding: 0.25rem 0.45rem; line-height: 1;" title="Remove Item">&times;</button>
    </td>
  `;
  tbody.appendChild(tr);

  // Directly assign DOM property values to guarantee they render visibly
  const bracketSelect = tr.querySelector('.item-bracket-select');
  const customBracketInput = tr.querySelector('.item-bracket-custom-input');
  const nameInput = tr.querySelector('.item-name-input');
  const qtyInput = tr.querySelector('.item-qty-input');
  const unitInput = tr.querySelector('.item-unit-input');

  if (bracketSelect) bracketSelect.value = selectedSelectValue;
  if (customBracketInput) customBracketInput.value = isCustom ? safeBracket : '';
  if (nameInput) nameInput.value = safeName;
  if (qtyInput) qtyInput.value = safeQty;
  if (unitInput) unitInput.value = safeUnit;
}

function removeBroadcastItemRow(btn) {
  const tr = btn.closest('tr');
  if (tr) tr.remove();
}

function collectBroadcastItemsFromBuilder() {
  const rows = document.querySelectorAll('#org-broadcast-items-tbody tr.broadcast-item-row');
  const items = [];
  rows.forEach(tr => {
    const selectEl = tr.querySelector('.item-bracket-select');
    const customInput = tr.querySelector('.item-bracket-custom-input');
    let bracket = 'General';
    if (selectEl) {
      if (selectEl.value === '__custom__') {
        bracket = (customInput?.value || '').trim() || 'Custom';
      } else {
        bracket = selectEl.value.trim();
      }
    } else {
      bracket = (tr.querySelector('.item-bracket-input')?.value || 'General').trim();
    }

    const name = (tr.querySelector('.item-name-input')?.value || '').trim();
    const qty = parseInt(tr.querySelector('.item-qty-input')?.value, 10) || 1;
    const unit = (tr.querySelector('.item-unit-input')?.value || 'items').trim();
    if (name) {
      const itemObj = {
        age_bracket: bracket,
        item_name: name,
        quantity_needed: qty,
        unit: unit
      };
      if (tr.dataset.itemId) {
        itemObj.id = parseInt(tr.dataset.itemId, 10);
      }
      if (tr.dataset.secured) {
        itemObj.quantity_secured = parseInt(tr.dataset.secured, 10);
      }
      items.push(itemObj);
    }
  });
  return items;
}

async function handleCreateOrgBroadcast(event) {
  event.preventDefault();
  const editId = document.getElementById('org-broadcast-edit-id')?.value || editingBroadcastId;
  const title = (document.getElementById('org-broadcast-title')?.value || '').trim();
  const roadCondition = document.getElementById('org-broadcast-road')?.value || 'Motorable';
  const location = (document.getElementById('org-broadcast-location')?.value || '').trim();
  const safeDropPoint = (document.getElementById('org-broadcast-drop-point')?.value || '').trim();
  const description = (document.getElementById('org-broadcast-desc')?.value || '').trim();
  const beneficiaryCount = parseInt(document.getElementById('org-beneficiary-count')?.value, 10) || 50;
  const items = collectBroadcastItemsFromBuilder();

  if (!title) {
    showToast('Please specify a title for the broadcast.', true);
    return;
  }
  if (!location || !safeDropPoint) {
    showToast('Please provide both relief location and nearest safe drop-point for logistics.', true);
    return;
  }
  if (items.length === 0) {
    showToast('Please include at least one needed supply item.', true);
    return;
  }

  const submitBtn = document.getElementById('org-broadcast-submit-btn');
  const submitBtnText = document.getElementById('org-broadcast-submit-btn-text');
  if (submitBtn) {
    submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = editId ? 'Saving Changes...' : 'Publishing Broadcast...';
  }

  try {
    const url = editId ? `/api/org/broadcasts/${editId}` : '/api/org/broadcasts/create';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        urgency_mode: selectedBroadcastMode,
        beneficiary_count: beneficiaryCount,
        road_condition: roadCondition,
        location,
        safe_drop_point: safeDropPoint,
        description,
        items
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save broadcast.');
    }

    showToast(editId ? 'Relief Needs Broadcast updated successfully!' : 'Relief Needs Broadcast published successfully!');
    closeOrgBroadcastModal();
    await loadOrgBroadcasts();
    broadcastFeedSync();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = editId ? 'Save Broadcast Changes' : 'Publish Needs Broadcast';
    }
  }
}

let currentOrgBroadcastTab = 'all';

function switchOrgBroadcastTab(tabName) {
  currentOrgBroadcastTab = tabName;
  const tabs = ['all', 'my', 'community'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}-broadcasts`);
    if (btn) btn.classList.toggle('active', t === tabName);
  });

  const secMy = document.getElementById('section-my-org-broadcasts');
  const secComm = document.getElementById('section-community-org-broadcasts');

  if (tabName === 'all') {
    if (secMy) secMy.style.display = 'block';
    if (secComm) secComm.style.display = 'block';
  } else if (tabName === 'my') {
    if (secMy) secMy.style.display = 'block';
    if (secComm) secComm.style.display = 'none';
  } else if (tabName === 'community') {
    if (secMy) secMy.style.display = 'none';
    if (secComm) secComm.style.display = 'block';
  }
}

async function loadOrgBroadcasts(isSilent = false) {
  const myContainer = document.getElementById('my-org-broadcasts-container');
  const communityContainer = document.getElementById('community-org-broadcasts-container');
  const legacyContainer = document.getElementById('org-broadcasts-container');

  if (!myContainer && !legacyContainer && currentView !== 'org-broadcasts') return;

  try {
    const res = await fetch('/api/org/broadcasts');
    if (!res.ok) return;
    const data = await res.json();
    const broadcasts = data.broadcasts || [];
    cachedOrgBroadcasts = broadcasts;

    const currentUserId = currentUser ? currentUser.id : null;
    const isOrg = currentUser && currentUser.role === 'Organization';
    const isAdmin = currentUser && currentUser.role === 'Admin';

    // Separate broadcasts: My Org vs Community/Partner Orgs
    const myBroadcasts = data.my_broadcasts || broadcasts.filter(b => b.org_id === currentUserId);
    const communityBroadcasts = data.community_broadcasts || broadcasts.filter(b => b.org_id !== currentUserId && (isAdmin || b.is_active));

    // Update KPI Metric Cards (for Org role, shows their own drives; for Admin, shows all)
    const kpiSource = isOrg ? myBroadcasts : broadcasts;
    let activeDrives = 0;
    let totalSecured = 0;
    let totalNeeded = 0;

    kpiSource.forEach(b => {
      if (b.is_active) {
        activeDrives += 1;
        totalSecured += (b.items_secured || 0);
        totalNeeded += (b.items_needed || 0);
      }
    });

    const activeEl = document.getElementById('org-kpi-active-count');
    const securedEl = document.getElementById('org-kpi-secured-count');
    const neededEl = document.getElementById('org-kpi-needed-count');
    const rateEl = document.getElementById('org-kpi-fulfillment-rate');

    if (activeEl) activeEl.textContent = activeDrives;
    if (securedEl) securedEl.textContent = totalSecured.toLocaleString();
    if (neededEl) neededEl.textContent = Math.max(0, totalNeeded - totalSecured).toLocaleString();
    if (rateEl) {
      const overallRate = totalNeeded > 0 ? Math.min(100, Math.round((totalSecured / totalNeeded) * 100)) : 0;
      rateEl.textContent = `${overallRate}%`;
    }

    // Update Tab and Section Badge Counts
    const bAll = document.getElementById('badge-all-count');
    const bMy = document.getElementById('badge-my-count');
    const bComm = document.getElementById('badge-community-count');
    const myCountTag = document.getElementById('my-broadcasts-count-tag');
    const commCountTag = document.getElementById('community-broadcasts-count-tag');

    if (bAll) bAll.textContent = broadcasts.length;
    if (bMy) bMy.textContent = myBroadcasts.length;
    if (bComm) bComm.textContent = communityBroadcasts.length;
    if (myCountTag) myCountTag.textContent = `${myBroadcasts.filter(b => b.is_active).length} active`;
    if (commCountTag) commCountTag.textContent = `${communityBroadcasts.length} partner drives`;

    // Render Section 1: My Organization Broadcasts
    if (myContainer) {
      if (myBroadcasts.length === 0) {
        myContainer.innerHTML = `
          <div class="empty-state" style="padding: 2rem 1.5rem; background: var(--surface-2); border: 1px dashed var(--line-2); border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: var(--ink-3); font-size: 0.9rem;">You haven't created any needs broadcasts yet. Click <strong>"Create Needs Broadcast"</strong> above to launch a relief drive.</p>
          </div>
        `;
      } else {
        myContainer.innerHTML = myBroadcasts.map(b => renderOrgBroadcastCard(b, true, true)).join('');
      }
    }

    // Render Section 2: Community & Partner Broadcasts
    if (communityContainer) {
      if (communityBroadcasts.length === 0) {
        communityContainer.innerHTML = `
          <div class="empty-state" style="padding: 2rem 1.5rem; background: var(--surface-2); border: 1px dashed var(--line-2); border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: var(--ink-3); font-size: 0.9rem;">No active broadcasts from partner campus organizations at this time.</p>
          </div>
        `;
      } else {
        communityContainer.innerHTML = communityBroadcasts.map(b => renderOrgBroadcastCard(b, true, false)).join('');
      }
    }

    // Fallback for legacy single container
    if (legacyContainer && !myContainer) {
      if (broadcasts.length === 0) {
        legacyContainer.innerHTML = `
          <div class="empty-state">
            <h3>No Needs Broadcasts Yet</h3>
            <p>Click "Create Needs Broadcast" above to mobilize campus students for disaster relief, school recovery, or community projects.</p>
          </div>
        `;
      } else {
        legacyContainer.innerHTML = broadcasts.map(b => renderOrgBroadcastCard(b, true, b.org_id === currentUserId)).join('');
      }
    }
  } catch (err) {
    if (!isSilent) console.error('Error loading org broadcasts:', err);
  }
}

function getUrgencyBadgeHtml(mode) {
  switch (mode) {
    case 'crisis_shelter':
      return `<span class="badge badge-red badge-status"><span class="status-dot dot-red"></span>Crisis – Immediate Shelter / CFS</span>`;
    case 'crisis_school':
      return `<span class="badge badge-amber badge-status"><span class="status-dot dot-amber"></span>Crisis – School Recovery</span>`;
    case 'seasonal_drive':
      return `<span class="badge badge-yellow badge-status"><span class="status-dot dot-yellow"></span>Seasonal Drive</span>`;
    case 'ongoing':
    default:
      return `<span class="badge badge-green badge-status"><span class="status-dot dot-green"></span>Ongoing Project</span>`;
  }
}

function renderOrgBroadcastCard(b, isOrgPortalView = true, isMineOverride = null) {
  const urgencyClass = `urgency-${b.urgency_mode || 'crisis_shelter'}`;
  const isMine = isMineOverride !== null ? isMineOverride : (currentUser && b.org_id === currentUser.id);
  const isAdmin = currentUser && currentUser.role === 'Admin';
  const pct = Math.min(100, Math.round(b.fulfillment_percentage || 0));


  const itemsHtml = (b.items || []).map(item => {
    const isFulfilled = item.quantity_secured >= item.quantity_needed;
    const remaining = Math.max(0, item.quantity_needed - item.quantity_secured);
    return `
      <div class="broadcast-item-card ${isFulfilled ? 'is-fulfilled' : ''}">
        <div class="item-card-top">
          <span class="item-bracket-tag" title="${escapeAttr(item.age_bracket || 'General')}">${escapeHtml(item.age_bracket || 'General')}</span>
          <span class="item-progress-ratio ${isFulfilled ? 'fulfilled' : ''}">
            ${item.quantity_secured} / ${item.quantity_needed}
          </span>
        </div>
        <div class="item-card-name" title="${escapeAttr(item.item_name)}">
          ${escapeHtml(item.item_name)}
        </div>
        <div class="item-card-bottom">
          <span class="item-remaining-pill ${isFulfilled ? 'fulfilled' : ''}">
            ${isFulfilled ? 'Completed' : `(${remaining} left)`}
          </span>
          ${!isFulfilled && item.quantity_pending ? `<span style="font-size: 0.72rem; font-weight: 700; color: var(--amber); background: var(--amber-wash); padding: 2px 6px; border-radius: 4px;" title="${item.quantity_pending} currently pledged and pending physical drop-off">${item.quantity_pending} pending</span>` : ''}
          <span class="item-unit-tag">${escapeHtml(item.unit || 'units')}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <article class="org-broadcast-card ${urgencyClass}" id="org-broadcast-card-${b.id}">
      <!-- Header Row: Status badge left, timestamp right on same line -->
      <div class="org-broadcast-header-row">
        <div class="org-header-badges">
          ${!isOrgPortalView ? '<span class="badge badge-important">IMPORTANT • Organization Broadcast</span>' : ''}
          ${getUrgencyBadgeHtml(b.urgency_mode)}
          ${!b.is_active ? '<span class="badge badge-neutral">Closed / Completed</span>' : ''}
        </div>
        <span class="broadcast-timestamp">${escapeHtml(b.created_at)}</span>
      </div>

      <!-- Main Title -->
      <h3 class="org-broadcast-title">${escapeHtml(b.title)}</h3>

      <!-- Organization Meta Row -->
      <div class="org-broadcast-meta-row">
        <span class="meta-org-name">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>
          ${escapeHtml(b.org_name)}
        </span>
        <span class="badge badge-blue badge-verified">Verified Org</span>
        ${b.beneficiary_count ? `<span class="meta-beneficiary-count">&bull; <strong>${b.beneficiary_count}</strong> Beneficiaries</span>` : ''}
      </div>

      <!-- Concise Description -->
      ${b.description ? `<p class="org-broadcast-desc">${escapeHtml(b.description)}</p>` : ''}

      <!-- Structured 3-Column Logistics Metadata Row -->
      <div class="org-logistics-grid">
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Access
          </span>
          <span class="logistics-col-value font-medium">${escapeHtml(b.road_condition || 'Motorable')}</span>
        </div>
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            Relief Site
          </span>
          <span class="logistics-col-value" title="${escapeAttr(b.location)}">${escapeHtml(b.location)}</span>
        </div>
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>
            Drop-Point
          </span>
          <span class="logistics-col-value font-medium" title="${escapeAttr(b.safe_drop_point)}">${escapeHtml(b.safe_drop_point)}</span>
        </div>
      </div>

      <!-- Live Fulfillment Progress: Label and percentage neatly grouped -->
      <div class="fulfillment-progress-wrapper">
        <div class="fulfillment-progress-header">
          <div class="fulfillment-label-group">
            <span class="progress-title">Relief Fulfillment Progress:</span>
            <span class="progress-counts">
              <strong>${b.items_secured || 0}</strong> of <strong>${b.items_needed || 0}</strong> items secured
              ${b.items_pending ? ` <span style="font-weight: 600; color: var(--amber);">(${b.items_pending} pending drop-off)</span>` : ''}
            </span>
          </div>
          <span class="progress-percentage ${pct >= 100 ? 'text-success' : 'text-primary'}">${pct}%</span>
        </div>
        <div class="fulfillment-progress-track">
          <div class="fulfillment-progress-fill" style="width: ${pct}%;"></div>
        </div>
      </div>

      <!-- Needed Supplies Breakdown in Equal-Width 3-Column Grid -->
      <div class="broadcast-supplies-section">
        <div class="supplies-section-header">
          <span>Needed Supplies &amp; Age-Bracket Breakdown</span>
          <span class="supplies-stats">${(b.items || []).filter(i => i.quantity_secured >= i.quantity_needed).length} of ${(b.items || []).length} categories fulfilled</span>
        </div>
        <div class="broadcast-items-grid">
          ${itemsHtml}
        </div>
      </div>

      <!-- Card Action Footer -->
      <div class="org-broadcast-card-footer">
        <div class="footer-meta-text">
          ${b.is_active ? 'Active relief drive accepting community contributions' : 'Relief drive marked as closed'}
        </div>
        <div class="footer-actions">
          ${isOrgPortalView && (isMine || (currentUser && currentUser.role === 'Admin'))
            ? `
              <button type="button" class="btn-primary btn-sm" onclick="openOrgRecordPage(${b.id})" style="">
                + Record Supplies
              </button>
              <button type="button" class="btn-outline btn-sm" onclick="openOrgBroadcastRecordsPage(${b.id})" style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                <span>Records &amp; Pledges</span>
                ${b.pending_pledges_count ? `<span style="background: var(--amber-wash); color: var(--amber); font-size: 0.72rem; font-weight: 800; padding: 1px 6px; border-radius: 9999px;">${b.pending_pledges_count}</span>` : ''}
              </button>
              <button type="button" class="btn-outline btn-sm" onclick="openOrgEditBroadcast(${b.id})">
                Edit
              </button>
              <button type="button" class="btn-outline btn-sm" onclick="toggleCloseOrgBroadcast(${b.id})">
                ${b.is_active ? 'Close Drive' : 'Reopen Drive'}
              </button>
              <button type="button" class="btn-danger btn-sm" onclick="confirmDeleteOrgBroadcast(${b.id}, '${escapeAttr(b.title)}')">
                Delete
              </button>
            `
            : isOrgPortalView && !isMine
              ? b.is_active
                ? `
                  <button type="button" class="btn-primary btn-sm" onclick="openOrgRecordPage(${b.id})" style="display: flex; align-items: center; gap: 0.45rem; font-weight: 600;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>Contribute / Pledge Supplies</span>
                  </button>
                `
                : `<span class="badge badge-neutral">Drive Completed</span>`
              : b.is_active
                ? `
                  <button type="button" class="btn-primary btn-sm" onclick="openOrgRecordPage(${b.id}, 'feed')" style="display: flex; align-items: center; gap: 0.45rem; font-weight: 600;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
                    <span>Help Fulfill / Donate Item</span>
                  </button>
                `
                : `<span class="badge badge-neutral">Drive Completed</span>`
          }
        </div>
      </div>
    </article>
  `;
}

async function toggleCloseOrgBroadcast(broadcastId) {
  try {
    const res = await fetch(`/api/org/broadcasts/${broadcastId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update broadcast status.');
    showToast(data.message || 'Status updated.');
    await loadOrgBroadcasts();
    broadcastFeedSync();
  } catch (err) {
    showToast(err.message, true);
  }
}

function confirmDeleteOrgBroadcast(broadcastId, title) {
  openConfirmModal(
    `Are you sure you want to delete this needs broadcast: "${title}"? All pledged data will be permanently removed.`,
    'Delete Broadcast',
    () => performDeleteOrgBroadcast(broadcastId)
  );
}

async function performDeleteOrgBroadcast(broadcastId) {
  try {
    const res = await fetch(`/api/org/broadcasts/${broadcastId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete broadcast.');
    showToast(data.message || 'Broadcast deleted.');
    await loadOrgBroadcasts();
    broadcastFeedSync();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --------------------------------------------------------------------------
// 14. DEDICATED FULL-PAGE MULTI-ITEM BATCH RECORD & CONTRIBUTE ENGINE
// --------------------------------------------------------------------------
async function openOrgRecordPage(broadcastId, returnView = null) {
  const allBroadcasts = [...cachedOrgBroadcasts, ...cachedFeedOrgBroadcasts];
  let b = allBroadcasts.find(x => x.id === broadcastId);
  if (!b) {
    try {
      const res = await fetch(`/api/org/broadcasts/${broadcastId}`);
      if (res.ok) {
        const data = await res.json();
        b = data.broadcast;
      }
    } catch (err) {
      console.error('Error fetching broadcast for recording:', err);
    }
  }
  if (!b) {
    showToast('Broadcast not found.', true);
    return;
  }

  activeRecordBroadcast = b;
  recordPageReturnView = returnView || (currentView === 'feed' || currentView === 'admin-feed' ? 'feed' : 'org-broadcasts');

  const isOwner = currentUser && b.org_id === currentUser.id;

  const backLabel = document.getElementById('record-page-back-label');
  if (backLabel) {
    backLabel.textContent = recordPageReturnView === 'feed' ? 'Back to Campus Feed' : 'Back to Needs Broadcasts';
  }

  const titleEl = document.getElementById('record-page-title');
  const subtitleEl = document.getElementById('record-page-subtitle');
  const btnText = document.getElementById('batch-record-submit-btn-text');

  if (titleEl) titleEl.textContent = isOwner ? 'Record Received Supplies' : 'Contribute / Pledge Supplies';
  if (subtitleEl) subtitleEl.textContent = isOwner
    ? 'Enter quantities for any supplies physically received for this drive and save once.'
    : 'Enter quantities for the items you are providing and confirm once.';
  if (btnText) btnText.textContent = isOwner ? 'Save Recorded Supplies' : 'Confirm Contribution';

  // Configure donor details / memo fields
  const donorNameContainer = document.getElementById('record-donor-name-container');
  const metaHeading = document.getElementById('record-meta-heading');
  const metaSub = document.getElementById('record-meta-sub');
  const donorNameInp = document.getElementById('record-donor-name');
  const donorNotesInp = document.getElementById('record-donor-notes');

  if (donorNameInp) donorNameInp.value = '';
  if (donorNotesInp) donorNotesInp.value = '';

  if (isOwner) {
    if (donorNameContainer) donorNameContainer.style.display = 'block';
    if (metaHeading) metaHeading.textContent = 'Donor & Delivery Details';
    if (metaSub) metaSub.textContent = 'Specify who provided these physical offline supplies for permanent recording.';
  } else {
    if (donorNameContainer) donorNameContainer.style.display = 'none';
    if (metaHeading) metaHeading.textContent = 'Pledge Delivery Notes (Optional)';
    if (metaSub) metaSub.textContent = 'Add any message or estimated drop-off time for the organization.';
  }

  // Summary box (clean left alignment, no stray bullet)
  const summaryBox = document.getElementById('record-page-summary-box');
  if (summaryBox) {
    summaryBox.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.65rem; flex-wrap: wrap;">
        ${getUrgencyBadgeHtml(b.urgency_mode)}
        <span class="badge badge-blue">Verified Org</span>
      </div>
      <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--ink); margin: 0 0 0.45rem 0; line-height: 1.35;">
        ${escapeHtml(b.title)}
      </h2>
      <div style="font-size: 0.86rem; color: var(--ink-2); margin-bottom: 0.85rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span><strong>${escapeHtml(b.org_name)}</strong></span>
        ${b.beneficiary_count ? `<span>&bull;</span> <span><strong>${b.beneficiary_count}</strong> Beneficiaries</span>` : ''}
      </div>
      <div class="org-logistics-grid" style="margin-top: 0.5rem;">
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Access
          </span>
          <span class="logistics-col-value font-medium">${escapeHtml(b.road_condition || 'Motorable')}</span>
        </div>
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            Relief Site
          </span>
          <span class="logistics-col-value" title="${escapeAttr(b.location)}">${escapeHtml(b.location)}</span>
        </div>
        <div class="logistics-col">
          <span class="logistics-col-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>
            Drop-Point
          </span>
          <span class="logistics-col-value font-medium" title="${escapeAttr(b.safe_drop_point)}">${escapeHtml(b.safe_drop_point)}</span>
        </div>
      </div>
    `;
  }

  // Multi-item side-by-side list
  const itemsContainer = document.getElementById('record-page-items-list');
  if (itemsContainer) {
    const items = b.items || [];
    if (items.length === 0) {
      itemsContainer.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--ink-3);">No supply items found for this drive.</div>';
    } else {
      itemsContainer.innerHTML = items.map(it => {
        const remaining = Math.max(0, it.quantity_needed - it.quantity_secured);
        const isFulfilled = remaining === 0;
        return `
          <div class="record-item-row ${isFulfilled ? 'is-fulfilled' : ''}" data-item-id="${it.id}" data-remaining="${remaining}">
            <div class="record-item-left">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px; flex-wrap: wrap;">
                <span class="badge badge-neutral" style="font-size: 0.74rem; font-weight: 600;">${escapeHtml(it.age_bracket || 'General')}</span>
                ${isFulfilled ? '<span class="badge badge-green" style="font-size: 0.72rem;">Fulfilled</span>' : ''}
              </div>
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--ink); margin-bottom: 3px;">
                ${escapeHtml(it.item_name)}
              </div>
              <div style="font-size: 0.8rem; color: var(--ink-3);">
                <span><strong>${it.quantity_secured}</strong> / ${it.quantity_needed} secured</span>
                <span style="margin: 0 5px; opacity: 0.5;">&bull;</span>
                <span class="${isFulfilled ? 'text-success font-medium' : 'text-primary font-medium'}">
                  ${isFulfilled ? 'Fully secured' : `${remaining} left`}
                </span>
              </div>
            </div>

            <div class="record-item-right">
              ${!isFulfilled ? `
                <button
                  type="button"
                  class="fill-remaining-btn"
                  onclick="fillItemRemaining(${it.id}, ${remaining})"
                  title="Quick-set to remaining ${remaining} needed"
                >
                  Fill Remaining (${remaining})
                </button>
              ` : ''}
              <div class="record-qty-stepper-box">
                <button
                  type="button"
                  class="stepper-btn"
                  onclick="stepItemQty(${it.id}, -1)"
                  ${isFulfilled ? 'disabled' : ''}
                  aria-label="Decrease quantity"
                >&minus;</button>
                <input
                  type="number"
                  class="form-control batch-item-qty-input"
                  id="batch-qty-input-${it.id}"
                  data-item-id="${it.id}"
                  data-remaining="${remaining}"
                  value="0"
                  min="0"
                  max="${remaining}"
                  ${isFulfilled ? 'disabled style="background: var(--line); color: var(--ink-3);"' : ''}
                  oninput="handleBatchItemQtyChange(${it.id})"
                  style="width: 72px; text-align: center; font-weight: 800; font-size: 0.95rem; padding: 0.35rem 0.3rem;"
                />
                <button
                  type="button"
                  class="stepper-btn"
                  onclick="stepItemQty(${it.id}, 1)"
                  ${isFulfilled ? 'disabled' : ''}
                  aria-label="Increase quantity"
                >&plus;</button>
              </div>
              <span style="font-size: 0.82rem; color: var(--ink-3); min-width: 45px;">${escapeHtml(it.unit || 'units')}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  updateBatchRecordSummary();
  navigateTo('org-record-broadcast');
}

function handleBackFromRecordPage() {
  const returnView = recordPageReturnView || 'org-broadcasts';
  activeRecordBroadcast = null;
  navigateTo(returnView);
}

function stepItemQty(itemId, delta) {
  const input = document.getElementById(`batch-qty-input-${itemId}`);
  if (!input || input.disabled) return;
  const max = parseInt(input.dataset.remaining, 10) || 999999;
  let currentVal = parseInt(input.value, 10) || 0;
  let nextVal = currentVal + delta;
  if (nextVal < 0) nextVal = 0;
  if (nextVal > max) nextVal = max;
  input.value = nextVal;
  updateBatchRecordSummary();
}

function fillItemRemaining(itemId, remaining) {
  const input = document.getElementById(`batch-qty-input-${itemId}`);
  if (!input || input.disabled) return;
  input.value = remaining;
  updateBatchRecordSummary();
}

function handleBatchItemQtyChange(itemId) {
  const input = document.getElementById(`batch-qty-input-${itemId}`);
  if (!input || input.disabled) return;
  const max = parseInt(input.dataset.remaining, 10) || 999999;
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) val = 0;
  if (val > max) val = max;
  input.value = val;
  updateBatchRecordSummary();
}

function updateBatchRecordSummary() {
  const inputs = document.querySelectorAll('.batch-item-qty-input');
  let totalQty = 0;
  let categoriesCount = 0;

  inputs.forEach(inp => {
    const val = parseInt(inp.value, 10) || 0;
    if (val > 0) {
      totalQty += val;
      categoriesCount += 1;
    }
  });

  const totalEl = document.getElementById('batch-record-total-qty');
  const catEl = document.getElementById('batch-record-categories-count');
  const submitBtn = document.getElementById('batch-record-submit-btn');

  if (totalEl) totalEl.textContent = totalQty;
  if (catEl) catEl.textContent = categoriesCount;
  if (submitBtn) {
    submitBtn.disabled = totalQty === 0;
  }
}

async function handleSubmitBatchRecord() {
  if (!activeRecordBroadcast) return;
  const itemsToUpdate = [];
  document.querySelectorAll('.batch-item-qty-input').forEach(input => {
    const qty = parseInt(input.value, 10) || 0;
    const itemId = parseInt(input.dataset.itemId, 10);
    if (qty > 0 && itemId) {
      itemsToUpdate.push({ item_id: itemId, quantity: qty });
    }
  });

  if (itemsToUpdate.length === 0) {
    showToast('Please enter a quantity greater than 0 for at least one item.', true);
    return;
  }

  const isOwner = currentUser && activeRecordBroadcast.org_id === currentUser.id;
  const donorName = (document.getElementById('record-donor-name')?.value || '').trim();
  const notes = (document.getElementById('record-donor-notes')?.value || '').trim();
  const submitBtn = document.getElementById('batch-record-submit-btn');
  const btnText = document.getElementById('batch-record-submit-btn-text');

  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = isOwner ? 'Saving Recorded Supplies...' : 'Confirming Contribution...';

  try {
    const res = await fetch(`/api/org/broadcasts/${activeRecordBroadcast.id}/batch-fulfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: itemsToUpdate,
        donor_name: donorName,
        notes: notes
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update supplies.');
    }

    const returnView = recordPageReturnView || 'org-broadcasts';

    if (!isOwner) {
      // Contributor pledge registered -> Show Pledge Confirmation Pass with Ref Code
      showToast('Pledge recorded! Reference Code: ' + (data.reference_code || ''));
      openPledgePassModal(data.reference_code, activeRecordBroadcast, data.contribution || { items: itemsToUpdate });
      activeRecordBroadcast = null;
      if (returnView === 'org-broadcasts') {
        loadOrgBroadcasts();
      } else if (returnView === 'feed' || returnView === 'admin-feed') {
        loadFeedWorkspace(true);
      }
      broadcastFeedSync();
      return;
    }

    // Owner recording offline walk-in supplies directly verified
    showToast('Offline supplies logged & verified into permanent ledger.');
    activeRecordBroadcast = null;

    if (returnView === 'org-broadcasts') {
      await loadOrgBroadcasts();
    } else if (returnView === 'feed' || returnView === 'admin-feed') {
      await loadFeedWorkspace(true);
    }
    broadcastFeedSync();
    navigateTo(returnView);
  } catch (err) {
    console.error('Error submitting batch record:', err);
    showToast(err.message, true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = isOwner ? 'Save Recorded Supplies' : 'Confirm Contribution';
  }
}

const openOrgFulfillModal = openOrgRecordPage;

// --------------------------------------------------------------------------
// 15. PLEDGE PASS VOUCHER MODAL (Reference Code for Drop-off)
// --------------------------------------------------------------------------
function openPledgePassModal(refCode, broadcast, contrib) {
  const modal = document.getElementById('pledge-pass-modal-backdrop');
  if (!modal) return;

  const codeEl = document.getElementById('pledge-pass-code');
  const dropEl = document.getElementById('pledge-pass-droppoint');
  const itemsContainer = document.getElementById('pledge-pass-items-list');

  if (codeEl) codeEl.textContent = refCode || 'SL-0000';
  if (dropEl) dropEl.textContent = broadcast?.safe_drop_point || 'Main Campus Gate / Relief Hub';

  if (itemsContainer) {
    const items = (contrib && contrib.items) || [];
    itemsContainer.innerHTML = items.map(it => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); font-size: 0.84rem;">
        <div>
          <span style="font-weight: 600; color: var(--ink);">${escapeHtml(it.item_name || 'Supply Item')}</span>
          ${it.age_bracket ? `<span style="font-size: 0.75rem; color: var(--ink-3); margin-left: 6px;">(${escapeHtml(it.age_bracket)})</span>` : ''}
        </div>
        <div style="font-weight: 700; color: var(--green);">
          ${it.pledged_qty || it.quantity || 0} ${escapeHtml(it.unit || 'units')}
        </div>
      </div>
    `).join('') || '<div style="padding: 0.5rem; text-align: center; color: var(--ink-3);">No items specified.</div>';
  }

  modal.classList.remove('hidden');
}

function closePledgePassModal() {
  const modal = document.getElementById('pledge-pass-modal-backdrop');
  if (modal) modal.classList.add('hidden');
}

function copyPledgePassCode() {
  const codeEl = document.getElementById('pledge-pass-code');
  const copyText = document.getElementById('pledge-pass-copy-text');
  if (!codeEl) return;
  const text = codeEl.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    if (copyText) copyText.textContent = 'Copied!';
    setTimeout(() => {
      if (copyText) copyText.textContent = 'Copy';
    }, 2000);
    showToast(`Reference code ${text} copied to clipboard!`);
  }).catch(() => {
    showToast(`Code: ${text}`);
  });
}

// --------------------------------------------------------------------------
// 16. OWNER CONTRIBUTIONS & VERIFICATION LEDGER ENGINE
// --------------------------------------------------------------------------
let currentRecordsBroadcast = null;
let currentRecordsList = [];

async function openOrgBroadcastRecordsPage(broadcastId) {
  try {
    const res = await fetch(`/api/org/broadcasts/${broadcastId}/contributions`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch contribution records.');
    }
    const data = await res.json();
    currentRecordsBroadcast = data.broadcast;
    currentRecordsList = data.contributions || [];

    renderRecordsSummary(currentRecordsBroadcast);
    renderRecordsTabsData();

    navigateTo('org-broadcast-records');
  } catch (err) {
    console.error('Error opening broadcast records page:', err);
    showToast(err.message, true);
  }
}

function handleBackFromRecordsLedger() {
  currentRecordsBroadcast = null;
  currentRecordsList = [];
  navigateTo('org-broadcasts');
}

function switchRecordsTab(tab) {
  const tabBtnPending = document.getElementById('tab-btn-pending-pledges');
  const tabBtnVerified = document.getElementById('tab-btn-verified-ledger');
  const panePending = document.getElementById('pane-pending-pledges');
  const paneVerified = document.getElementById('pane-verified-ledger');

  if (tab === 'pending') {
    if (tabBtnPending) {
      tabBtnPending.classList.add('active');
      tabBtnPending.style.borderBottomColor = 'var(--pen)';
      tabBtnPending.style.color = 'var(--pen)';
    }
    if (tabBtnVerified) {
      tabBtnVerified.classList.remove('active');
      tabBtnVerified.style.borderBottomColor = 'transparent';
      tabBtnVerified.style.color = 'var(--ink-3)';
    }
    if (panePending) panePending.classList.remove('hidden');
    if (paneVerified) paneVerified.classList.add('hidden');
  } else {
    if (tabBtnVerified) {
      tabBtnVerified.classList.add('active');
      tabBtnVerified.style.borderBottomColor = 'var(--green)';
      tabBtnVerified.style.color = 'var(--green)';
    }
    if (tabBtnPending) {
      tabBtnPending.classList.remove('active');
      tabBtnPending.style.borderBottomColor = 'transparent';
      tabBtnPending.style.color = 'var(--ink-3)';
    }
    if (paneVerified) paneVerified.classList.remove('hidden');
    if (panePending) panePending.classList.add('hidden');
  }
}

function renderRecordsSummary(b) {
  const card = document.getElementById('records-broadcast-summary-card');
  if (!card || !b) return;

  const pct = Math.min(100, Math.round(b.fulfillment_percentage || 0));
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px;">
          ${getUrgencyBadgeHtml(b.urgency_mode)}
          <span class="badge ${b.is_active ? 'badge-green' : 'badge-neutral'}">${b.is_active ? 'Active Drive' : 'Closed'}</span>
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--ink); margin: 0 0 2px 0;">${escapeHtml(b.title)}</h2>
        <div style="font-size: 0.84rem; color: var(--ink-3);">Drop-off Location: <strong style="color: var(--ink);">${escapeHtml(b.safe_drop_point || b.location)}</strong></div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 1.15rem; font-weight: 800; color: var(--green);">${pct}% Fulfilled</span>
        <div style="font-size: 0.8rem; color: var(--ink-3);">${b.items_secured || 0} / ${b.items_needed || 0} secured</div>
      </div>
    </div>
  `;
}

function renderRecordsTabsData() {
  const pending = currentRecordsList.filter(c => c.status === 'pending_dropoff');
  const verified = currentRecordsList.filter(c => c.status === 'verified_received');

  const pendingBadge = document.getElementById('badge-pending-count');
  const verifiedBadge = document.getElementById('badge-verified-count');
  if (pendingBadge) pendingBadge.textContent = pending.length;
  if (verifiedBadge) verifiedBadge.textContent = verified.length;

  // Render Pending Drop-Offs
  const pendingContainer = document.getElementById('pending-pledges-container');
  if (pendingContainer) {
    if (pending.length === 0) {
      pendingContainer.innerHTML = `
        <div style="background: #FFFFFF; border: 1px dashed var(--line-2); border-radius: 10px; padding: 2.5rem 1.5rem; text-align: center; color: var(--ink-3);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.8" style="margin-bottom: 0.5rem;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <div style="font-weight: 700; color: var(--ink); font-size: 0.95rem; margin-bottom: 3px;">No Pending Drop-Offs</div>
          <p style="font-size: 0.84rem; margin: 0;">All community pledges have been verified or there are no open drop-offs at this time.</p>
        </div>
      `;
    } else {
      pendingContainer.innerHTML = pending.map(c => `
        <div class="create-broadcast-card" style="margin-bottom: 1rem; border-left: 4px solid var(--hl-edge); text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px;">
                <span style="font-family: var(--font-ui); font-variant-numeric: tabular-nums;  font-weight: 800; font-size: 1rem; color: var(--amber); background: var(--amber-wash); padding: 2px 8px; border-radius: 6px;">${escapeHtml(c.reference_code)}</span>
                <span class="badge ${c.contributor_type === 'organization' ? 'badge-amber' : 'badge-blue'}">${c.contributor_type === 'organization' ? 'Organization' : 'Student'}</span>
                <span class="badge badge-amber">Pending Drop-off</span>
              </div>
              <div style="font-weight: 700; font-size: 1rem; color: var(--ink);">${escapeHtml(c.contributor_name)}</div>
              <div style="font-size: 0.78rem; color: var(--ink-3);">Pledged on ${escapeHtml(c.created_at)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button type="button" class="btn-primary btn-sm" onclick="openVerifyModalForContribution(${c.id})" style=" display: inline-flex; align-items: center; gap: 4px; font-weight: 700;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Verify &amp; Mark Received
              </button>
              <button type="button" class="btn-outline btn-sm" onclick="confirmCancelContribution(${c.id}, '${escapeAttr(c.reference_code)}')" style="color: var(--danger); border-color: var(--danger-line);">
                Cancel / No-Show
              </button>
            </div>
          </div>

          <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.5rem;">
            <div style="font-size: 0.74rem; font-weight: 700; color: var(--ink-2); margin-bottom: 4px;">Pledged Supplies (${c.total_items_pledged} items total):</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${(c.items || []).map(it => `
                <div style="background: #FFFFFF; border: 1px solid var(--line-2); border-radius: 6px; padding: 3px 8px; font-size: 0.82rem;">
                  <strong>${it.pledged_qty || it.quantity || 0} ${escapeHtml(it.unit || 'units')}</strong> &bull; ${escapeHtml(it.item_name)}
                  ${it.age_bracket ? `<span style="color: var(--ink-3); font-size: 0.75rem;">(${escapeHtml(it.age_bracket)})</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          ${c.notes ? `<div style="font-size: 0.8rem; color: var(--ink-3);"><strong>Note:</strong> ${escapeHtml(c.notes)}</div>` : ''}
        </div>
      `).join('');
    }
  }

  // Render Verified History Ledger
  const verifiedTbody = document.getElementById('verified-ledger-tbody');
  if (verifiedTbody) {
    if (verified.length === 0) {
      verifiedTbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 2rem; text-align: center; color: var(--ink-3);">
            No verified transactions logged yet. Verified pledges and physical offline receipts will appear in this audit ledger.
          </td>
        </tr>
      `;
    } else {
      verifiedTbody.innerHTML = verified.map(c => `
        <tr style="border-bottom: 1px solid var(--line);">
          <td style="padding: 0.75rem 0.85rem; font-family: var(--font-ui); font-variant-numeric: tabular-nums;  font-weight: 700; color: var(--ink);">
            ${escapeHtml(c.reference_code)}
          </td>
          <td style="padding: 0.75rem 0.85rem; color: var(--ink-2); white-space: nowrap;">
            ${escapeHtml(c.verified_at || c.created_at)}
          </td>
          <td style="padding: 0.75rem 0.85rem;">
            <div style="font-weight: 600; color: var(--ink);">${escapeHtml(c.contributor_name)}</div>
            <span class="badge ${c.contributor_type === 'offline_walkin' ? 'badge-neutral' : (c.contributor_type === 'organization' ? 'badge-amber' : 'badge-blue')}" style="font-size: 0.68rem; margin-top: 2px;">
              ${c.contributor_type === 'offline_walkin' ? 'Offline Walk-in' : (c.contributor_type === 'organization' ? 'Organization' : 'Student')}
            </span>
          </td>
          <td style="padding: 0.75rem 0.85rem;">
            <div style="display: flex; flex-direction: column; gap: 3px;">
              ${(c.items || []).map(it => `
                <span style="color: var(--ink); font-size: 0.82rem;">
                  <strong>${it.received_qty != null ? it.received_qty : (it.pledged_qty || 0)} ${escapeHtml(it.unit || 'units')}</strong> &bull; ${escapeHtml(it.item_name)}
                </span>
              `).join('')}
            </div>
          </td>
          <td style="padding: 0.75rem 0.85rem; color: var(--ink-3); font-size: 0.8rem;">
            <div>Verified by: <strong>${escapeHtml(c.verified_by || 'Organization')}</strong></div>
            ${c.notes ? `<div style="margin-top: 2px; color: var(--ink-2); font-style: italic;">${escapeHtml(c.notes)}</div>` : ''}
          </td>
        </tr>
      `).join('');
    }
  }
}

function exportCurrentBroadcastLedgerCsv() {
  if (!currentRecordsBroadcast) return;
  window.location.href = `/api/org/broadcasts/${currentRecordsBroadcast.id}/contributions/export.csv`;
}

// --------------------------------------------------------------------------
// 17. OWNER PHYSICAL VERIFICATION PROMPT ENGINE
// --------------------------------------------------------------------------
let activeVerifyContribution = null;

function openVerifyModalForContribution(contribId) {
  const contrib = currentRecordsList.find(c => c.id === contribId);
  if (!contrib) return;
  activeVerifyContribution = contrib;

  const modal = document.getElementById('verify-contribution-modal-backdrop');
  if (!modal) return;

  const metaEl = document.getElementById('verify-modal-meta');
  if (metaEl) {
    metaEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span style="font-family: var(--font-ui); font-variant-numeric: tabular-nums;  font-weight: 800; color: var(--green); font-size: 0.95rem;">${escapeHtml(contrib.reference_code)}</span>
          <span style="margin: 0 6px; opacity: 0.4;">&bull;</span>
          <strong>${escapeHtml(contrib.contributor_name)}</strong>
          <span class="badge ${contrib.contributor_type === 'organization' ? 'badge-amber' : 'badge-blue'}" style="font-size: 0.7rem; margin-left: 6px;">
            ${contrib.contributor_type === 'organization' ? 'Organization' : 'Student'}
          </span>
        </div>
        <div style="font-size: 0.78rem; color: var(--ink-3);">Pledged: ${escapeHtml(contrib.created_at)}</div>
      </div>
      ${contrib.notes ? `<div style="margin-top: 6px; font-size: 0.8rem; color: var(--ink-2);"><em>Note: ${escapeHtml(contrib.notes)}</em></div>` : ''}
    `;
  }

  const tbody = document.getElementById('verify-modal-items-tbody');
  if (tbody) {
    tbody.innerHTML = (contrib.items || []).map(it => {
      const pledged = it.pledged_qty || it.quantity || 0;
      return `
        <tr style="border-bottom: 1px solid var(--line);">
          <td style="padding: 0.55rem 0.65rem;">
            <div style="font-weight: 600; color: var(--ink);">${escapeHtml(it.item_name)}</div>
            ${it.age_bracket ? `<span style="font-size: 0.74rem; color: var(--ink-3);">${escapeHtml(it.age_bracket)}</span>` : ''}
          </td>
          <td style="padding: 0.55rem 0.65rem; text-align: right; font-weight: 700; color: var(--ink-3);">
            ${pledged} ${escapeHtml(it.unit || 'units')}
          </td>
          <td style="padding: 0.55rem 0.65rem; text-align: right;">
            <input
              type="number"
              class="form-control verify-item-actual-qty"
              data-item-id="${it.item_id}"
              value="${pledged}"
              min="0"
              max="100000"
              style="width: 80px; text-align: right; font-weight: 800; font-size: 0.88rem; display: inline-block; padding: 0.25rem 0.45rem;"
            />
          </td>
        </tr>
      `;
    }).join('');
  }

  const notesInput = document.getElementById('verify-modal-notes');
  if (notesInput) notesInput.value = '';

  modal.classList.remove('hidden');
}

function closeVerifyContributionModal() {
  activeVerifyContribution = null;
  const modal = document.getElementById('verify-contribution-modal-backdrop');
  if (modal) modal.classList.add('hidden');
}

async function submitVerifyContribution() {
  if (!activeVerifyContribution) return;

  const actualInputs = document.querySelectorAll('.verify-item-actual-qty');
  const receivedItems = [];
  actualInputs.forEach(inp => {
    const itId = parseInt(inp.dataset.itemId, 10);
    const qty = parseInt(inp.value, 10) || 0;
    receivedItems.push({ item_id: itId, received_qty: qty });
  });

  const notes = (document.getElementById('verify-modal-notes')?.value || '').trim();
  const btn = document.getElementById('confirm-verify-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/org/contributions/${activeVerifyContribution.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received_items: receivedItems, notes: notes })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify contribution.');
    }

    showToast(data.message || 'Contribution verified successfully!');
    closeVerifyContributionModal();

    if (currentRecordsBroadcast) {
      await openOrgBroadcastRecordsPage(currentRecordsBroadcast.id);
    }
    loadOrgBroadcasts();
    broadcastFeedSync();
  } catch (err) {
    console.error('Error verifying contribution:', err);
    showToast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function confirmCancelContribution(contribId, refCode) {
  openConfirmModal(
    `Are you sure you want to mark pledge ${refCode} as cancelled / no-show? This will release the pledged supplies count.`,
    async () => {
      try {
        const res = await fetch(`/api/org/contributions/${contribId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Marked as cancelled / no-show.' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to cancel pledge.');
        showToast(`Pledge ${refCode} has been cancelled.`);
        if (currentRecordsBroadcast) {
          await openOrgBroadcastRecordsPage(currentRecordsBroadcast.id);
        }
        loadOrgBroadcasts();
        broadcastFeedSync();
      } catch (err) {
        console.error('Error cancelling contribution:', err);
        showToast(err.message, true);
      }
    }
  );
}

// --------------------------------------------------------------------------
// 18. MY RELIEF CONTRIBUTIONS (Contributor Pledge History Engine)
// --------------------------------------------------------------------------
async function loadMyContributions() {
  const container = document.getElementById('my-contributions-container');
  if (!container) return;

  container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--ink-3);">Loading contribution records...</div>';

  try {
    const res = await fetch('/api/user/contributions');
    if (!res.ok) throw new Error('Failed to load contributions.');
    const data = await res.json();
    const list = data.contributions || [];

    if (list.length === 0) {
      container.innerHTML = `
        <div style="background: #FFFFFF; border: 1px dashed var(--line-2); border-radius: 12px; padding: 3rem 1.5rem; text-align: center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.8" style="margin-bottom: 0.75rem;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--ink); margin: 0 0 6px 0;">No Contributions Yet</h3>
          <p style="font-size: 0.88rem; color: var(--ink-3); max-width: 480px; margin: 0 auto 1.25rem auto;">
            You haven't pledged toward any organization relief drives yet. Browse open drives to contribute storybooks, learning materials, or study kits.
          </p>
          <button type="button" class="btn-primary btn-sm" onclick="navigateTo('${currentUser && currentUser.role === 'Organization' ? 'org-broadcasts' : 'feed'}')">
            Browse Needed Broadcasts
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(c => {
      const isVerified = c.status === 'verified_received';
      const isPending = c.status === 'pending_dropoff';
      const badgeClass = isVerified ? 'badge-green' : (isPending ? 'badge-amber' : 'badge-neutral');
      const badgeText = isVerified ? 'Verified Received' : (isPending ? 'Pending Drop-off' : 'Cancelled');

      return `
        <div class="create-broadcast-card" style="margin-bottom: 1.25rem; border-left: 4px solid ${isVerified ? 'var(--green)' : (isPending ? 'var(--hl-edge)' : 'var(--ink-3)')}; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px;">
                <span style="font-family: var(--font-ui); font-variant-numeric: tabular-nums;  font-weight: 800; font-size: 1.05rem; color: ${isVerified ? 'var(--green)' : 'var(--amber)'}; background: ${isVerified ? 'var(--green-wash)' : 'var(--amber-wash)'}; padding: 2px 8px; border-radius: 6px;">${escapeHtml(c.reference_code)}</span>
                <span class="badge ${badgeClass}">${badgeText}</span>
                ${getUrgencyBadgeHtml(c.urgency_mode)}
              </div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--ink); margin: 0 0 2px 0;">${escapeHtml(c.broadcast_title || 'Relief Drive')}</h3>
              <div style="font-size: 0.84rem; color: var(--ink-2);">
                Organized by <strong>${escapeHtml(c.org_name || 'Organization')}</strong> &bull; Pledged on ${escapeHtml(c.created_at)}
              </div>
            </div>
            ${isPending ? `
              <button type="button" class="btn-outline btn-sm" onclick="confirmCancelContribution(${c.id}, '${escapeAttr(c.reference_code)}')" style="color: var(--danger); border-color: var(--danger-line);">
                Cancel Pledge
              </button>
            ` : ''}
          </div>

          <!-- Drop Point Notice -->
          <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.75rem;">
            <span style="font-size: 0.74rem; font-weight: 700; color: var(--ink-2); display: block; margin-bottom: 2px;">Designated Drop-Off Point:</span>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--ink);">${escapeHtml(c.safe_drop_point || 'Campus Drop-Off Point')}</div>
          </div>

          <!-- Items Breakdown -->
          <div style="margin-bottom: 0.65rem;">
            <span style="font-size: 0.74rem; font-weight: 700; color: var(--ink-2); display: block; margin-bottom: 4px;">Pledged Supplies:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${(c.items || []).map(it => `
                <div style="background: #FFFFFF; border: 1px solid var(--line-2); border-radius: 6px; padding: 4px 10px; font-size: 0.82rem;">
                  <strong style="color: ${isVerified ? 'var(--green)' : 'var(--ink)'};">${isVerified ? (it.received_qty != null ? it.received_qty : it.pledged_qty) : (it.pledged_qty || it.quantity || 0)} ${escapeHtml(it.unit || 'units')}</strong>
                  &bull; ${escapeHtml(it.item_name)}
                  ${it.age_bracket ? `<span style="color: var(--ink-3); font-size: 0.74rem;">(${escapeHtml(it.age_bracket)})</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          ${isVerified ? `
            <div style="font-size: 0.8rem; color: var(--green); font-weight: 600;">
              Physically verified on ${escapeHtml(c.verified_at)} by ${escapeHtml(c.verified_by || 'Organization')}
            </div>
          ` : `
            <div style="font-size: 0.78rem; color: var(--amber);">
              Please bring items to the drop-off point and present reference code <strong>${escapeHtml(c.reference_code)}</strong> to complete verification.
            </div>
          `}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading my contributions:', err);
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--danger);">${escapeHtml(err.message)}</div>`;
  }
}
