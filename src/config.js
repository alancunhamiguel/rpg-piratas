const mongoose = require('mongoose');

// Obtenha a URI do MongoDB da variável de ambiente, se definida.
// Caso contrário, use a string diretamente.
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://oncodyuser:gCLNx5rSSIXifYiE@rpguser-cluster.y0kadgf.mongodb.net/RPGUSER-CLUSTER?retryWrites=true&w=majority&appName=RPGUSER-CLUSTER";

// Conectar ao MongoDB
const connect = mongoose.connect(MONGODB_URI);

// Verificar se a conexão foi bem-sucedida
connect.then(() => {
    console.log("Database Connected Successfully!");
})
.catch((error) => { // Capture o erro para depuração
    console.error("Database Cannot Be Connected!", error);
});

// Criar um esquema para o usuário
const LoginSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true // Garante que o nome de usuário seja único
    },
    password: {
        type: String,
        required: true
    },
    isAdmin: { // Campo para identificar se é administrador (mantido)
        type: Boolean,
        default: false
    },
    // NOVO CAMPO: Array para armazenar IDs de personagens associados a este usuário
    characters: [{
        type: mongoose.Schema.Types.ObjectId, // Tipo que armazena o ID de outro documento
        ref: 'Character' // 'Character' é o nome do modelo que você criará em src/models/Character.js
                         // É CRÍTICO que o nome do modelo aqui ('Character')
                         // corresponda EXATAMENTE ao nome que você usará no
                         // mongoose.model() dentro de Character.js.
    }]
});

// Criar o modelo da coleção
// 'users' será o nome da sua coleção no MongoDB
const collection = new mongoose.model('users', LoginSchema);

module.exports = collection;
