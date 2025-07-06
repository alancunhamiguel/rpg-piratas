const mongoose = require('mongoose');

const CharacterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, // Garante que cada personagem tem um nome único (ou unique para o owner)
        trim: true
    },
    owner: { // Quem é o dono deste personagem (referência ao ID do usuário)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // 'User' é o nome do seu modelo de usuário em config.js (ou 'users' se for o caso)
        required: true
    },
    type: { // Pirata, Marinheiro
        type: String,
        required: true,
        enum: ['Pirata', 'Marinheiro'] // Limita as opções
    },
    gender: { // Homem, Mulher
        type: String,
        required: true,
        enum: ['Homem', 'Mulher'] // Limita as opções
    },
    class: { // Lutador, Atirador, Espadachim
        type: String,
        required: true,
        enum: ['Lutador', 'Atirador', 'Espadachin'] // Limita as opções
    },
    level: {
        type: Number,
        default: 1, // Começa no nível 1
        min: 1
    },
    experience: {
        type: Number,
        default: 0, // XP atual
        min: 0
    },
    skillPoints: { // Pontos para distribuir em stats
        type: Number,
        default: 0, // Começa com 0, ganha 4 por nível
        min: 0
    },
    stats: { // Atributos base do personagem
        attack: { type: Number, default: 10, min: 0 }, // Valores iniciais
        agility: { type: Number, default: 10, min: 0 },
        defense: { type: Number, default: 10, min: 0 },
        critical: { type: Number, default: 5, min: 0 } // Crítico pode ser %
    },
    hp: { // Vida atual
        type: Number,
        default: 100, // Vida inicial
        min: 0
    },
    maxHp: { // Vida máxima
        type: Number,
        default: 100, // Vida máxima inicial
        min: 0
    },
    // Itens equipados (referência a IDs de itens, a serem criados no modelo Item)
    equippedItems: {
        armor: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        boots: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        helmet: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        weapon: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
    },
    // Inventário do personagem (array de objetos com o ID do item e quantidade)
    inventory: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        quantity: { type: Number, default: 1, min: 1 }
    }],
    activeBuffs: [{ // Para buffs temporários de skills
        name: String,
        duration: Number, // Em turnos
        effect: Object // Ex: { stat: 'attack', value: 0.10 } para +10%
    }],
    // Você pode adicionar mais campos conforme necessário, como:
    // skillsLearned: [{ name: String, levelAcquired: Number }],
    // currentIsland: { type: mongoose.Schema.Types.ObjectId, ref: 'Island' },
    // lastBattleTime: Date
}, {
    timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// Garante que a combinação de owner e name seja única (um usuário não pode ter dois personagens com o mesmo nome)
CharacterSchema.index({ owner: 1, name: 1 }, { unique: true });

const Character = mongoose.model('Character', CharacterSchema);

module.exports = Character;