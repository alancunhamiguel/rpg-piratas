const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, // Garante que o nome do personagem seja único
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // Referência ao modelo de usuário (LoginSchema)
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['Humano', 'Elfo', 'Anão', 'Orc', 'Marinheiro', 'Pirata'] // ATUALIZADO: Adicionado 'Pirata'
    },
    gender: {
        type: String,
        required: true,
        enum: ['Masculino', 'Feminino', 'Não Binário']
    },
    class: {
        type: String,
        required: true,
        enum: ['Guerreiro', 'Mago', 'Ladrão', 'Arqueiro', 'Espadachim', 'Atirador', 'Lutador'] // ATUALIZADO: Adicionado 'Atirador' e 'Lutador'
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
    skillPoints: {
        type: Number,
        default: 0,
        min: 0
    },
    hp: {
        type: Number,
        default: 100,
        min: 0
    },
    maxHp: {
        type: Number,
        default: 100,
        min: 1
    },
    stats: {
        strength: { type: Number, default: 10, min: 0 },
        defense: { type: Number, default: 10, min: 0 },
        agility: { type: Number, default: 10, min: 0 },
        intelligence: { type: Number, default: 10, min: 0 }
    },
    inventory: [
        {
            item: { type: String, required: true },
            quantity: { type: Number, default: 1, min: 1 }
        }
    ],
    learnedSkills: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Skill' // Referência ao modelo de Skill
        }
    ],
    activeSkills: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Skill'
        }
    ],
    activeBuffs: [
        {
            name: String,
            stat: String,
            value: Number,
            duration: Number,
            turnsRemaining: Number
        }
    ],
    skillCooldowns: [
        {
            skill: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Skill'
            },
            turnsRemaining: Number
        }
    ],
    gold: {
        type: Number,
        default: 0,
        min: 0
    },
    cash: {
        type: Number,
        default: 0,
        min: 0
    }
});

// Middleware para garantir que o HP atual não exceda o HP máximo
characterSchema.pre('save', function(next) {
    if (this.hp > this.maxHp) {
        this.hp = this.maxHp;
    }
    next();
});

const Character = mongoose.model('Character', characterSchema);

module.exports = Character;
