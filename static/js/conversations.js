class ConversationManager {
    constructor() {
        this.currentConversationId = null;
        this.conversations = [];
        this.initializeUI();
        this.loadConversations();
    }

    initializeUI() {
        // Création de la structure de la sidebar
        const sidebar = document.querySelector('.sidebar');
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="logo">Y</div>
                <div class="header-title">Yolsda</div>
            </div>
            <button class="new-chat-btn">
                <i class="fas fa-plus"></i> Nouvelle conversation
            </button>
            <div class="conversations-list"></div>
        `;

        // Event listeners
        document.querySelector('.new-chat-btn').addEventListener('click', () => this.startNewConversation());
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) throw new Error('Erreur lors du chargement des conversations');
            const data = await response.json();
            // Le backend renvoie un tableau de conversations
            this.conversations = data;
            this.renderConversations();
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    renderConversations() {
        const container = document.querySelector('.conversations-list');
        container.innerHTML = this.conversations
            .map(conv => this.createConversationElement(conv))
            .join('');

        // Ajoute les event listeners
        container.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => this.loadConversation(item.dataset.id));
        });
    }

    createConversationElement(conversation) {
        const date = new Date(conversation.created_at);
        const isActive = conversation.id === this.currentConversationId;
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 data-id="${conversation.id}">
                <div class="conversation-info">
                    <div class="conversation-title">
                        <i class="fas fa-comments"></i>
                        ${this.formatDate(date)}
                    </div>
                    <div class="conversation-actions">
                        <button class="delete-btn" title="Supprimer"
                                onclick="event.stopPropagation(); conversationManager.deleteConversation('${conversation.conversation_id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return "Aujourd'hui";
        if (days === 1) return "Hier";
        if (days < 7) return `Il y a ${days} jours`;
        return date.toLocaleDateString();
    }

    async loadConversation(conversationId) {
        try {
            const response = await fetch(`/api/conversations/${conversationId}/history`);
            if (!response.ok) throw new Error('Erreur lors du chargement de la conversation');

            const data = await response.json();
            this.currentConversationId = conversationId;
            this.displayConversation(data.history);
            this.updateUI();
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    displayConversation(history) {
        const chatContainer = document.querySelector('.chat-container');
        chatContainer.innerHTML = '';

        history.forEach(message => {
            this.appendMessage(message.message, 'user');
            this.appendMessage(message.response, 'ai', message.sources);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    appendMessage(content, sender, sources = []) {
        const chatContainer = document.querySelector('.chat-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = this.markdownToHtml(content);

        messageDiv.appendChild(messageContent);

        if (sources && sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'message-sources';
            sourcesDiv.innerHTML = `
                <details>
                    <summary>Sources (${sources.length})</summary>
                    <ul>
                        ${sources.map(source => `<li>${source}</li>`).join('')}
                    </ul>
                </details>
            `;
            messageDiv.appendChild(sourcesDiv);
        }

        chatContainer.appendChild(messageDiv);
    }

    startNewConversation() {
        this.currentConversationId = null;
        document.querySelector('.chat-container').innerHTML = '';
        this.updateUI();
    }

    

    updateUI() {
        // Met à jour l'interface utilisateur
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('active',
                item.dataset.id === this.currentConversationId);
        });
    }

    markdownToHtml(text) {
        // Conversion simple du markdown en HTML
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }
}

// Initialisation
window.conversationManager = new ConversationManager();