const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config"); // Certifique-se de que 'collection' está configurado corretamente para o seu modelo MongoDB

// Importar express-session e connect-mongo
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();

// Converter data em json 
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// Configurar express-session
app.use(session({
    secret: 'sd@sds#fgewrwe3223321Da', // Use uma string aleatória e complexa para produção
    resave: false, // Não salva a sessão se não houver modificações
    saveUninitialized: false, // Não cria uma sessão para usuários não autenticados
    store: MongoStore.create({
        mongoUrl: 'mongodb+srv://oncodyuser:gCLNx5rSSIXifYiE@rpguser-cluster.y0kadgf.mongodb.net/RPGUSER-CLUSTER?retryWrites=true&w=majority&appName=RPGUSER-CLUSTER', // A URL do seu banco de dados MongoDB (a mesma do config.js)
        ttl: 14 * 24 * 60 * 60, // Tempo de vida da sessão em segundos (14 dias)
        autoRemove: 'interval', // Remove sessões expiradas em intervalos
        autoRemoveInterval: 10 // Intervalo em minutos para remover sessões expiradas
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14 // Tempo de vida do cookie em milissegundos (14 dias)
    }
}));

// Usar ejs como view engine
app.set('view engine', 'ejs');

// Rota para a página de login
app.get("/", (req, res) => {
    // Se o usuário já estiver logado, redireciona para a home
    if (req.session.userId) {
        return res.redirect("/home");
    }
    res.render("login");
})

app.get("/signup", (req, res) => {
    res.render("signup");
})

// Middleware para verificar autenticação
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next(); // Usuário autenticado, continua para a próxima rota
    } else {
        res.redirect("/"); // Usuário não autenticado, redireciona para o login
    }
};

// Registro de usuário
app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.username,
        password: req.body.password,
        level: 0, // Adiciona o campo 'level' com valor inicial 0
        inventory: [] // Adiciona um inventário vazio para o novo usuário
    }

    // Checar se já existe o usuário na database
    const existingUser = await collection.findOne ({name: data.name});
    if(existingUser) {
        res.send("Tente outro Usuário. Esse já existe :(");
    } else {
        // Hash na senha
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);

        data.password = hashedPassword;

        try {
            const userdata = await collection.insertMany(data);
            console.log(userdata);
            res.send("Usuário cadastrado com sucesso!");
        } catch (error) {
            console.error("Erro ao cadastrar usuário:", error);
            res.send("Erro ao cadastrar usuário. Tente novamente.");
        }
    }
}); 

// Login de usuário
app.post("/login", async (req, res) => {
    try{
        const check = await collection.findOne({name: req.body.username});
        
        if(!check){
            return res.send("Usuário não encontrado");
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);
        
        if(isPasswordMatch) {
            // Armazena o ID do usuário e outros dados na sessão
            req.session.userId = check._id; // ID do documento MongoDB
            req.session.userName = check.name;
            req.session.userLevel = check.level;
            req.session.userInventory = check.inventory || []; // Carrega o inventário do usuário

            // Limpa qualquer estado de batalha ou inventário anterior na sessão ao fazer login
            req.session.battle = null;
            req.session.inventoryOpen = null;

            res.redirect("/home"); // Redireciona para a rota /home
        } else {
            res.send("Senha Errada");
        }
    } catch(error) {
        console.error("Erro durante o login:", error);
        res.send("Usuário e senha não conferem ou ocorreu um erro interno.");
    }
});

// Rota Home (protegida)
app.get("/home", isAuthenticated, (req, res) => {
    // Os dados do usuário já estão na sessão, acessíveis via req.session
    // Passa também o estado da batalha e do inventário para a renderização inicial
    res.render("home", { 
        userName: req.session.userName, 
        userLevel: req.session.userLevel,
        userInventory: req.session.userInventory,
        battleState: req.session.battle || null, // Passa o estado da batalha se existir
        inventoryState: req.session.inventoryOpen || null // Adiciona o estado do inventário
    });
});

// Rota para iniciar/reiniciar a batalha
app.get("/battle/start", isAuthenticated, (req, res) => {
    console.log("Rota /battle/start acessada.");
    // Inicializa o estado da batalha na sessão
    req.session.battle = {
        playerHP: 100, // Vida inicial do jogador
        enemyHP: 50,   // Vida inicial do Orc Level 1
        enemyName: "Orc Pirata",
        enemyLevel: 1,
        battleLog: ["A batalha contra o Orc Pirata começou!"],
        status: "active" // active, win, lose
    };
    req.session.inventoryOpen = null; // Garante que o inventário esteja fechado ao iniciar batalha
    res.redirect("/home"); // Redireciona para a home para exibir a batalha
});

// Rota para o jogador atacar
app.post("/battle/attack", isAuthenticated, async (req, res) => {
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ message: "Nenhuma batalha ativa.", battleState: battle });
    }

    const playerDamage = 20; // Dano do jogador
    const enemyDamage = 15;  // Dano do Orc

    // Turno do jogador
    battle.enemyHP -= playerDamage;
    battle.battleLog.push(`Você atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

    if (battle.enemyHP <= 0) {
        battle.enemyHP = 0;
        battle.status = "win";
        battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);
        
        // Lógica de recompensa: ganhar 1 nível e um item
        req.session.userLevel += 1;
        battle.battleLog.push(`Você ganhou 1 nível! Seu novo nível é ${req.session.userLevel}.`);

        const droppedItem = "Moeda de Ouro"; // Item de exemplo
        req.session.userInventory.push(droppedItem);
        battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

        // Atualiza o nível e inventário no banco de dados
        try {
            await collection.updateOne(
                { _id: req.session.userId },
                { $set: { level: req.session.userLevel, inventory: req.session.userInventory } }
            );
            battle.battleLog.push("Seu progresso foi salvo.");
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
            battle.battleLog.push("Erro ao salvar seu progresso.");
        }

        return res.json({ message: "Vitória!", battleState: battle, userLevel: req.session.userLevel, userInventory: req.session.userInventory });
    }

    // Turno do inimigo (se o inimigo ainda estiver vivo)
    battle.playerHP -= enemyDamage;
    battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage} de dano.`);

    if (battle.playerHP <= 0) {
        battle.playerHP = 0;
        battle.status = "lose";
        battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);
        return res.json({ message: "Derrota!", battleState: battle });
    }

    res.json({ message: "Turno concluído.", battleState: battle });
});

// Rota para resetar a batalha (voltar para a home sem batalha ativa)
app.post("/battle/reset", isAuthenticated, (req, res) => {
    console.log("Rota /battle/reset acessada.");
    req.session.battle = null; // Limpa o estado da batalha
    res.json({ message: "Batalha resetada." });
});

// Rota para exibir o inventário
app.get("/inventory/show", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/show acessada.");
    req.session.inventoryOpen = true; // Define o estado para mostrar o inventário
    req.session.battle = null; // Garante que a batalha esteja fechada ao abrir o inventário
    res.redirect("/home"); // Redireciona para a home para exibir o inventário
});

// Rota para esconder o inventário e voltar para a home
app.get("/inventory/hide", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/hide acessada.");
    req.session.inventoryOpen = null; // Limpa o estado do inventário
    res.redirect("/home"); // Redireciona para a home
});


// Rota para atualizar o inventário do usuário no banco de dados
app.post("/inventory/update", isAuthenticated, async (req, res) => {
    console.log("Rota /inventory/update acessada.");
    try {
        let { inventory } = req.body; // Pega o inventário do corpo da requisição
        
        // Garante que o inventário recebido seja um array, se não for, inicializa como array vazio
        if (!Array.isArray(inventory)) {
            console.warn("Received non-array inventory from client. Resetting to empty array.");
            inventory = [];
        }

        // Atualiza o inventário na sessão
        req.session.userInventory = inventory;

        // Atualiza o inventário no banco de dados
        await collection.updateOne(
            { _id: req.session.userId },
            { $set: { inventory: inventory } }
        );

        res.json({ success: true, message: "Inventário atualizado com sucesso!", inventory: inventory });
    } catch (error) {
        console.error("Erro ao atualizar inventário:", error);
        res.status(500).json({ success: false, message: "Erro interno ao atualizar inventário." });
    }
});

// Rota de Logout
app.get("/logout", (req, res) => {
    console.log("Rota /logout acessada.");
    req.session.destroy(err => {
        if (err) {
            console.error("Erro ao destruir sessão:", err);
            return res.send("Erro ao fazer logout.");
        }
        res.redirect("/"); // Redireciona para a página de login
    });
});


const port = 5000;
app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
})
