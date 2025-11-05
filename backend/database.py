import sqlite3
from datetime import datetime
from typing import List, Optional

class DatabaseManager:
    def __init__(self, db_path: str = "chat_history.db"):
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        """Initialise la base de données avec les tables nécessaires"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Création de la table des conversations
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            title TEXT,
            snippet TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Création de la table des messages
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            message TEXT NOT NULL,
            response TEXT NOT NULL,
            sources TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id)
        )
        ''')
        
        conn.commit()
        # Si la colonne 'title' n'existe pas (ancienne version), on l'ajoute
        cursor.execute("PRAGMA table_info(conversations)")
        cols = [r[1] for r in cursor.fetchall()]
        # Ajout de colonnes de compatibilité si absentes
        if 'title' not in cols:
            try:
                cursor.execute("ALTER TABLE conversations ADD COLUMN title TEXT")
            except Exception:
                pass
        if 'snippet' not in cols:
            try:
                cursor.execute("ALTER TABLE conversations ADD COLUMN snippet TEXT")
            except Exception:
                pass

        conn.commit()
        conn.close()
    
    def save_message(self, conversation_id: str, message: str, response: str, sources: List[str]):
        """Sauvegarde un message et sa réponse dans la base de données"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Vérifie si la conversation existe, sinon la crée
        # Crée la conversation si elle n'existe pas (sans title)
        cursor.execute(
            "INSERT OR IGNORE INTO conversations (conversation_id) VALUES (?)",
            (conversation_id,)
        )
        
        # Met à jour le timestamp de la conversation
        cursor.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
            (conversation_id,)
        )
        
        # Sauvegarde le message et la réponse
        cursor.execute(
            "INSERT INTO messages (conversation_id, message, response, sources) VALUES (?, ?, ?, ?)",
            (conversation_id, message, response, ",".join(sources))
        )
        # Met à jour également un "snippet"/aperçu pour la conversation (ex: dernière réponse tronquée)
        try:
            snippet = (response[:300] + '...') if response and len(response) > 300 else response
            cursor.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, snippet = ? WHERE conversation_id = ?",
                (snippet, conversation_id)
            )
        except Exception:
            # Ne pas bloquer la sauvegarde si la mise à jour du snippet échoue
            pass

        conn.commit()
        conn.close()

    def create_conversation(self, conversation_id: str, title: Optional[str] = None):
        """Crée une conversation avec un titre optionnel"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR IGNORE INTO conversations (conversation_id, title) VALUES (?, ?)",
            (conversation_id, title)
        )
        cursor.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
            (conversation_id,)
        )

        conn.commit()
        conn.close()

    def update_conversation_title(self, conversation_id: str, title: str):
        """Met à jour le titre d'une conversation"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
            (title, conversation_id)
        )

        conn.commit()
        conn.close()

    def get_conversation(self, conversation_id: str, limit: int = 100) -> dict:
        """Récupère les métadonnées et messages d'une conversation"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT conversation_id, title, created_at, updated_at FROM conversations WHERE conversation_id = ?",
            (conversation_id,)
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {}

        conv = {
            "id": row[0],
            "title": row[1] or "Nouvelle conversation",
            "snippet": row[2] if len(row) > 2 else None,
            "created_at": row[2],
            "updated_at": row[3],
            "messages": []
        }

        cursor.execute(
            "SELECT message, response, sources, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
            (conversation_id, limit)
        )

        # Chaque ligne contient le message utilisateur et la réponse IA.
        # On transforme cela en deux entrées successives (user puis ai) pour le frontend.
        for m in cursor.fetchall():
            user_msg = {
                "content": m[0],
                "sender": "user",
                "timestamp": m[3]
            }
            ai_msg = {
                "content": m[1],
                "sender": "ai",
                "timestamp": m[3],
                "sources": m[2].split(",") if m[2] else []
            }
            conv["messages"].append(user_msg)
            conv["messages"].append(ai_msg)

        conn.close()
        return conv
    
    def get_conversation_history(self, conversation_id: str, limit: int = 10) -> List[dict]:
        """Récupère l'historique d'une conversation"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            """
            SELECT message, response, sources, created_at 
            FROM messages 
            WHERE conversation_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
            """,
            (conversation_id, limit)
        )
        
        history = []
        for row in cursor.fetchall():
            history.append({
                "message": row[0],
                "response": row[1],
                "sources": row[2].split(",") if row[2] else [],
                "created_at": row[3]
            })
        
        conn.close()
        return history
    
    def get_all_conversations(self, limit: int = 20) -> List[dict]:
        """Récupère toutes les conversations"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # On récupère d'abord les conversations triées par updated_at
        cursor.execute(
            "SELECT conversation_id, title, snippet, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ?",
            (limit,)
        )

        conversations = []
        rows = cursor.fetchall()

        for row in rows:
            conv_id = row[0]
            title = row[1] or "Nouvelle conversation"
            snippet = row[2]
            created_at = row[3]
            updated_at = row[4]

            # Récupère le dernier message pour fournir un aperçu
            cursor.execute(
                "SELECT message, response, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
                (conv_id,)
            )
            last = cursor.fetchone()

            messages = []
            if last:
                # On retourne d'abord le dernier user message puis la réponse AI
                messages.append({
                    "content": last[0],
                    "sender": "user",
                    "timestamp": last[2]
                })
                messages.append({
                    "content": last[1],
                    "sender": "ai",
                    "timestamp": last[2]
                })

            # Compte total des messages
            cursor.execute("SELECT COUNT(id) FROM messages WHERE conversation_id = ?", (conv_id,))
            msg_count = cursor.fetchone()[0] or 0

            conversations.append({
                "id": conv_id,
                "title": title if len(title) <= 50 else title[:50] + "...",
                "snippet": snippet,
                "created_at": created_at,
                "updated_at": updated_at,
                "message_count": msg_count,
                "messages": messages
            })

        conn.close()
        return conversations

    def delete_conversation(self, conversation_id: str):
        """Supprime une conversation et tous ses messages"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Supprime d'abord les messages
            cursor.execute(
                "DELETE FROM messages WHERE conversation_id = ?",
                (conversation_id,)
            )
            
            # Puis supprime la conversation
            cursor.execute(
                "DELETE FROM conversations WHERE conversation_id = ?",
                (conversation_id,)
            )
            
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

  