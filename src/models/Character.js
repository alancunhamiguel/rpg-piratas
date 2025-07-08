const mongoose = require('mongoose');

const CharacterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // Referência ao seu modelo de usuário (LoginSchema)
        required: true
    },
    type: { // Facção (Marinheiro ou Pirata)
        type: String,
        required: true,
        enum: ['Marinheiro', 'Pirata'],
        default: 'Marinheiro'
    },
    gender: { // Gênero
        type: String,
        required: true,
        enum: ['Masculino', 'Feminino', 'Outro'],
        default: 'Masculino'
    },
    class: { // Classe de combate
        type: String,
        required: true,
        enum: ['Atirador', 'Espadachim', 'Lutador'],
        default: 'Lutador'
    },
    level: {
        type: Number,
        default: 1,
        min: 1
    },
    experience: {
        type: Number,
        default: 0,
        min: 0
    },
    skillPoints: { // Pontos para distribuir em stats
        type: Number,
        default: 0,
        min: 0
    },
    stats: {
        attack: { type: Number, default: 10, min: 1 },
        agility: { type: Number, default: 10, min: 1 },
        defense: { type: Number, default: 10, min: 1 },
        critical: { type: Number, default: 5, min: 0 } // Crítico pode ser %
    },
    hp: { // Health Points atual
        type: Number,
        default: 100,
        min: 0
    },
    maxHp: { // Health Points máximo
        type: Number,
        default: 100,
        min: 1
    },
    // NOVO CAMPO: Habilidades que o personagem aprendeu (IDs de Skill)
    learnedSkills: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill' // Referência ao modelo Skill
    }],
    // NOVO CAMPO: Habilidades ativas para a batalha (máximo de 2, IDs de Skill)
    activeSkills: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill' // Referência ao modelo Skill
    }],
    // NOVO CAMPO: Para controlar cooldowns de habilidades ativas (objeto com skill ID e turnos restantes)
    skillCooldowns: [{
        skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' },
        turnsRemaining: { type: Number, default: 0 }
    }],
    // Itens equipados (referência a IDs de itens, a serem criados no modelo Item)
    equippedItems: {
        armor: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        boots: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        helmet: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        weapon: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
    },
    inventory: [{
        item: { type: String }, // Temporário, idealmente seria mongoose.Schema.Types.ObjectId, ref: 'Item'
        quantity: { type: Number, default: 1, min: 1 }
    }],
    activeBuffs: [{ // Para buffs temporários de skills
        name: String,
        stat: String, // Ex: 'attack', 'defense'
        value: Number, // Ex: 0.10 para +10%
        duration: Number, // Em turnos
        turnsRemaining: Number // Turnos restantes do buff
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Adiciona createdAt e updatedAt
});

// Adiciona um índice único composto para garantir que um usuário não tenha dois personagens com o mesmo nome
CharacterSchema.index({ owner: 1, name: 1 }, { unique: true });

const Character = mongoose.model('Character', CharacterSchema);

module.exports = Character;
