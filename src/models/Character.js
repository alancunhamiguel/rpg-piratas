// src/models/Character.js (ou models/Character.js)
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
    // ATUALIZADO: 'type' agora são as facções
    type: { // Facção (Marinheiro ou Pirata)
        type: String,
        required: true,
        enum: ['Marinheiro', 'Pirata'], // Opções definidas aqui
        default: 'Marinheiro'
    },
    gender: { // Gênero
        type: String,
        required: true,
        enum: ['Masculino', 'Feminino', 'Outro'],
        default: 'Masculino'
    },
    // ATUALIZADO: 'class' agora são as classes de combate
    class: { // Classe de combate
        type: String,
        required: true,
        enum: ['Atirador', 'Espadim', 'Lutador'], // Opções definidas aqui
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
        strength: { type: Number, default: 10, min: 1 },
        intelligence: { type: Number, default: 10, min: 1 },
        dexterity: { type: Number, default: 10, min: 1 },
        constitution: { type: Number, default: 10, min: 1 },
        attack: { type: Number, default: 10, min: 1 },
        defense: { type: Number, default: 10, min: 1 }
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
    inventory: [
        {
            item: {
                type: String, // Temporário, idealmente seria mongoose.Schema.Types.ObjectId, ref: 'Item'
                required: true
            },
            quantity: {
                type: Number,
                default: 1,
                min: 1
            }
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Adiciona um índice único composto para garantir que um usuário não tenha dois personagens com o mesmo nome
CharacterSchema.index({ owner: 1, name: 1 }, { unique: true });

const Character = mongoose.model('Character', CharacterSchema);

module.exports = Character;