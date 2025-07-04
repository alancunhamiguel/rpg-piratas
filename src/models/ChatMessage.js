const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    sender: { // Quem enviou a mensagem (o nome do usuário)
        type: String,
        required: true,
        trim: true
    },
    message: { // O conteúdo da mensagem
        type: String,
        required: true,
        maxlength: 500 // Limite o tamanho da mensagem para evitar spam
    },
    timestamp: { // Quando a mensagem foi enviada
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false 
});

// AQUI É O PONTO CRÍTICO: Você precisa definir o modelo e EXPORTÁ-LO.
// 'ChatMessage' é o nome da collection no MongoDB (será pluralizado para 'chatmessages')
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema); 

module.exports = ChatMessage; // <--- Certifique-se que você está EXPORTANDO o MODELO