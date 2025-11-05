class HistoryManager {
    constructor() {
        this.historyContainer = document.querySelector('.history-container');
        this.currentConversationId = null;
        this.conversations = [];
        this.initializeHistory();
    }

    async initializeHistory() {
        await this.loadConversations();
        this.setupHistoryRefresh();
        this.setupKeyboardShortcuts();
    }

    setupHistoryRefresh() {
        // Rafraîchit l'historique toutes les 30 secondes
        setInterval(() => this.loadConversations(), 30000);
    }

    setupKeyboardShortcuts() {
        // Ctrl/Cmd + K pour chercher dans l'historique
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.showSearchDialog();
            }
        });
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.conversations = await response.json();
            this.displayConversations(this.conversations);
        } catch (error) {
            console.error('Erreur lors du chargement des conversations:', error);
            this.showError('Impossible de charger l\'historique');
        }
    }

    displayConversations(conversations) {
        if (!this.historyContainer) {
            console.error('Container d\'historique non trouvé');
            return;
        }

        // Grouper par date
        const grouped = this.groupByDate(conversations);
        
        let html = `
            <div class="history-header">
                <button class="new-chat-btn" onclick="historyManager.createNewChat()">
                    <span class="icon">+</span> Nouvelle conversation
                </button>
                <button class="search-history-btn" onclick="historyManager.showSearchDialog()">
                    <span class="icon">🔍</span> Rechercher
                </button>
            </div>
        `;

        Object.entries(grouped).forEach(([period, convs]) => {
            html += `
                <div class="history-section">
                    <div class="section-header">${period}</div>
                    ${convs.map(conv => this.createConversationItem(conv)).join('')}
                </div>
            `;
        });

        this.historyContainer.innerHTML = html;
        this.setupEventListeners();
    }

    groupByDate(conversations) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const groups = {
            "Aujourd'hui": [],
            "Hier": [],
            "7 derniers jours": [],
            "30 derniers jours": [],
            "Plus ancien": []
        };

        conversations.forEach(conv => {
            const date = new Date(conv.updated_at);
            
            if (date >= today) {
                groups["Aujourd'hui"].push(conv);
            } else if (date >= yesterday) {
                groups["Hier"].push(conv);
            } else if (date >= lastWeek) {
                groups["7 derniers jours"].push(conv);
            } else if (date >= lastMonth) {
                groups["30 derniers jours"].push(conv);
            } else {
                groups["Plus ancien"].push(conv);
            }
        });

        // Supprimer les groupes vides
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        });

        return groups;
    }

    createConversationItem(conv) {
        const isActive = conv.id === this.currentConversationId;
        const title = this.generateTitle(conv);
        
        return `
            <div class="history-entry ${isActive ? 'active' : ''}" 
                 data-conversation-id="${conv.id}"
                 onclick="historyManager.loadConversation('${conv.id}')">
                <div class="history-content">
                    <span class="icon">💬</span>
                    <span class="conversation-title">${this.escapeHtml(title)}</span>
                </div>
                <div class="history-actions">
                    <button class="action-btn rename-btn" 
                            onclick="event.stopPropagation(); historyManager.renameConversation('${conv.id}')"
                            title="Renommer">
                        ✏️
                    </button>
                    <button class="action-btn delete-btn" 
                            onclick="event.stopPropagation(); historyManager.deleteConversation('${conv.id}')"
                            title="Supprimer">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }

    generateTitle(conv) {
        // Si un titre personnalisé existe
        if (conv.title && conv.title.trim()) {
            return conv.title;
        }
        
        // Sinon, générer un titre à partir du premier message
        if (conv.first_message) {
            const maxLength = 40;
            const message = conv.first_message.trim();
            return message.length > maxLength 
                ? message.substring(0, maxLength) + '...'
                : message;
        }
        
        return 'Nouvelle conversation';
    }

    setupEventListeners() {
        // Les événements sont gérés via onclick dans le HTML
    }

    async loadConversation(conversationId) {
        try {
            this.currentConversationId = conversationId;
            
            const response = await fetch(`/api/conversations/${conversationId}/history`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            // Mettre à jour l'UI pour montrer la conversation active
            this.displayConversations(this.conversations);
            
            // Déclencher un événement pour que le reste de l'app charge la conversation
            window.dispatchEvent(new CustomEvent('conversationLoaded', { 
                detail: { conversationId, history: data.history } 
            }));
        } catch (error) {
            console.error('Erreur lors du chargement de la conversation:', error);
            this.showError('Impossible de charger cette conversation');
        }
    }

    async createNewChat() {
        try {
            const response = await fetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: 'Nouvelle conversation'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const newConv = await response.json();
            this.currentConversationId = newConv.id;
            
            await this.loadConversations();
            
            // Déclencher un événement pour réinitialiser le chat
            window.dispatchEvent(new CustomEvent('newConversation', { 
                detail: { conversationId: newConv.id } 
            }));
        } catch (error) {
            console.error('Erreur lors de la création d\'une nouvelle conversation:', error);
            this.showError('Impossible de créer une nouvelle conversation');
        }
    }

    async renameConversation(conversationId) {
        const conv = this.conversations.find(c => c.id === conversationId);
        const currentTitle = conv ? this.generateTitle(conv) : '';
        
        const newTitle = prompt('Nouveau titre:', currentTitle);
        
        if (newTitle !== null && newTitle.trim() !== '') {
            try {
                const response = await fetch(`/api/conversations/${conversationId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: newTitle.trim()
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                await this.loadConversations();
            } catch (error) {
                console.error('Erreur lors du renommage:', error);
                this.showError('Impossible de renommer cette conversation');
            }
        }
    }

    async deleteConversation(conversationId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (this.currentConversationId === conversationId) {
                this.currentConversationId = null;
                window.dispatchEvent(new CustomEvent('conversationDeleted'));
            }

            await this.loadConversations();
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            this.showError('Impossible de supprimer cette conversation');
        }
    }

    showSearchDialog() {
        const dialog = document.createElement('dialog');
        dialog.className = 'search-dialog';
        
        dialog.innerHTML = `
            <div class="dialog-content">
                <h2>Rechercher dans l'historique</h2>
                <input type="text" 
                       class="search-input" 
                       placeholder="Rechercher des conversations..."
                       autofocus>
                <div class="search-results"></div>
                <button class="close-dialog">Fermer</button>
            </div>
        `;

        const searchInput = dialog.querySelector('.search-input');
        const searchResults = dialog.querySelector('.search-results');
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            if (query.length < 2) {
                searchResults.innerHTML = '<p class="search-hint">Tapez au moins 2 caractères</p>';
                return;
            }

            const filtered = this.conversations.filter(conv => {
                const title = this.generateTitle(conv).toLowerCase();
                return title.includes(query);
            });

            if (filtered.length === 0) {
                searchResults.innerHTML = '<p class="no-results">Aucun résultat trouvé</p>';
            } else {
                searchResults.innerHTML = filtered.map(conv => `
                    <div class="search-result-item" 
                         onclick="historyManager.loadConversation('${conv.id}'); document.querySelector('.search-dialog').close();">
                        <strong>${this.escapeHtml(this.generateTitle(conv))}</strong>
                        <small>${new Date(conv.updated_at).toLocaleDateString()}</small>
                    </div>
                `).join('');
            }
        });

        dialog.querySelector('.close-dialog').onclick = () => {
            dialog.close();
            dialog.remove();
        };

        document.body.appendChild(dialog);
        dialog.showModal();
    }

    async saveMessage(message, response, sources = []) {
        if (!this.currentConversationId) {
            // Créer une nouvelle conversation automatiquement
            await this.createNewChat();
        }

        try {
            const historyResponse = await fetch(`/api/conversations/${this.currentConversationId}/history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    response,
                    sources
                })
            });

            if (!historyResponse.ok) {
                throw new Error(`HTTP error! status: ${historyResponse.status}`);
            }

            // Rafraîchir la liste pour mettre à jour le timestamp
            await this.loadConversations();
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du message:', error);
        }
    }

    showError(message) {
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.historyManager = new HistoryManager();
});