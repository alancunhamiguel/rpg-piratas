const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, // Garante que cada habilidade tem um nome único
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    requiredLevel: { // Nível que o personagem precisa para aprender/usar a habilidade
        type: Number,
        required: true,
        min: 1
    },
    class: [{ // Array de classes que podem aprender esta habilidade
        type: String,
        required: true,
        // Os valores aqui DEVEM corresponder EXATAMENTE aos enums definidos em Character.js para 'class'
        enum: ['Atirador', 'Espadachim', 'Lutador']
    }],
    effect: { // Objeto para descrever o efeito da habilidade
        type: Object,
        required: true,
        // Exemplos de estrutura de efeito:
        // { type: 'buff', stat: 'attack', value: 0.20, duration: 3, target: 'self', message: 'Seu ataque aumentou!' }
        // { type: 'damage', value: 30, target: 'enemy', message: 'Você causou dano extra!' }
        // { type: 'heal', value: 20, target: 'self', message: 'Você recuperou vida!' }
        // { type: 'debuff', stat: 'defense', value: 0.15, duration: 2, target: 'enemy', message: 'Defesa do inimigo diminuída!' }
    },
    cooldown: { // Cooldown em turnos (quantos turnos até poder usar novamente)
        type: Number,
        default: 0,
        min: 0
    },
    type: { // Tipo da habilidade (ajuda a lógica do jogo a entender como aplicá-la)
        type: String,
        required: true,
        enum: ['active_attack', 'active_defense', 'buff_self', 'buff_enemy', 'heal_self', 'passive']
    }
}, {
    timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// É crucial que esta linha esteja presente e correta para registrar o modelo
const Skill = mongoose.model('Skill', SkillSchema);

module.exports = Skill;
