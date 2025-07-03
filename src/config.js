const mongoose = require('mongoose');

// Conectar ao MongoDB (substitua 'mongodb://localhost:27017/seu_banco_de_dados' pela sua URL de conexão)
// Certifique-se de que o nome do seu banco de dados está correto aqui
const connect = mongoose.connect("mongodb+srv://oncodyuser:gCLNx5rSSIXifYiE@rpguser-cluster.y0kadgf.mongodb.net/RPGUSER-CLUSTER?retryWrites=true&w=majority&appName=RPGUSER-CLUSTER");

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
    level: { // Campo 'level'
        type: Number,
        default: 0 // Define o valor padrão como 0
    },
    inventory: { // Adiciona o campo 'inventory' ao esquema
        type: Array, // O inventário será um array de strings (nomes de itens)
        default: []  // Define o valor padrão como um array vazio
    }
});

// Criar o modelo da coleção
// 'users' será o nome da sua coleção no MongoDB
const collection = new mongoose.model('users', LoginSchema);

module.exports = collection;
