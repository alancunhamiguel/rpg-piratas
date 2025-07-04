const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config"); // Certifique-se de que 'collection' está configurado corretamente para o seu modelo MongoDB

// Importar express-session e connect-mongo
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose'); // <--- Adicionado: Importar Mongoose

const app = express();

// --- Conexão com o Banco de Dados (INÍCIO DA MUDANÇA PRINCIPAL) ---
// Obtém a URI do MongoDB da variável de ambiente
const MONGODB_URI = process.env.MONGODB_URI;

// Garante que a URI está definida
if (!MONGODB_URI) {
    console.error('ERRO: A variável de ambiente MONGODB_URI não está definida.');
    process.exit(1); // Encerra o processo se a URI não for encontrada
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Conexão com o banco de dados estabelecida!');
  })
  .catch(err => {
    console.error('Database Cannot Be Connected!', err);
    process.exit(1); // Encerra o processo se a conexão com o BD falhar
  });
// --- Conexão com o Banco de Dados (FIM DA MUDANÇA PRINCIPAL) ---


// Converter data em json 
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// Configurar express-session
app.use(session({
    secret: process.env.SESSION_SECRET || 'sd@sds#fgewrwe3223321Da', // <--- Ajustado: Usar variável de ambiente para o segredo da sessão
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI, // <--- Ajustado: Usar a variável MONGODB_URI aqui também
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'interval',
        autoRemoveInterval: 10
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14
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
        level: 0,
        inventory: []
    }

    // Checar se já existe o usuário na database
    try { // <--- Adicionado try/catch para a busca também
        const existingUser = await collection.findOne ({name: data.name});
        if(existingUser) {
            res.send("Tente outro Usuário. Esse já existe :(");
        } else {
            // Hash na senha
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(data.password, saltRounds);

            data.password = hashedPassword;

            const userdata = await collection.insertMany(data);
            console.log(userdata);
            res.send("Usuário cadastrado com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao verificar ou cadastrar usuário:", error); // <--- Mensagem de erro mais genérica
        res.status(500).send("Erro ao cadastrar usuário. Tente novamente."); // <--- Retorna status 500
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
            req.session.userId = check._id;
            req.session.userName = check.name;
            req.session.userLevel = check.level;
            req.session.userInventory = check.inventory || [];

            req.session.battle = null;
            req.session.inventoryOpen = null;

            res.redirect("/home");
        } else {
            res.send("Senha Errada");
        }
    } catch(error) {
        console.error("Erro durante o login:", error);
        res.status(500).send("Usuário e senha não conferem ou ocorreu um erro interno."); // <--- Retorna status 500
    }
});

// Rota Home (protegida)
app.get("/home", isAuthenticated, (req, res) => {
    res.render("home", { 
        userName: req.session.userName, 
        userLevel: req.session.userLevel,
        userInventory: req.session.userInventory,
        battleState: req.session.battle || null,
        inventoryState: req.session.inventoryOpen || null
    });
});

// Rota para iniciar/reiniciar a batalha
app.get("/battle/start", isAuthenticated, (req, res) => {
    console.log("Rota /battle/start acessada.");
    req.session.battle = {
        playerHP: 100,
        enemyHP: 50,
        enemyName: "Orc Pirata",
        enemyLevel: 1,
        battleLog: ["A batalha contra o Orc Pirata começou!"],
        status: "active"
    };
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Rota para o jogador atacar
app.post("/battle/attack", isAuthenticated, async (req, res) => {
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ message: "Nenhuma batalha ativa.", battleState: battle });
    }

    const playerDamage = 20;
    const enemyDamage = 15;

    battle.enemyHP -= playerDamage;
    battle.battleLog.push(`Você atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

    if (battle.enemyHP <= 0) {
        battle.enemyHP = 0;
        battle.status = "win";
        battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);
        
        req.session.userLevel += 1;
        battle.battleLog.push(`Você ganhou 1 nível! Seu novo nível é ${req.session.userLevel}.`);

        const droppedItem = "Moeda de Ouro";
        req.session.userInventory.push(droppedItem);
        battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

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
    req.session.battle = null;
    res.json({ message: "Batalha resetada." });
});

// Rota para exibir o inventário
app.get("/inventory/show", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/show acessada.");
    req.session.inventoryOpen = true;
    req.session.battle = null;
    res.redirect("/home");
});

// Rota para esconder o inventário e voltar para a home
app.get("/inventory/hide", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/hide acessada.");
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Rota para atualizar o inventário do usuário no banco de dados
app.post("/inventory/update", isAuthenticated, async (req, res) => {
    console.log("Rota /inventory/update acessada.");
    try {
        let { inventory } = req.body;
        
        if (!Array.isArray(inventory)) {
            console.warn("Received non-array inventory from client. Resetting to empty array.");
            inventory = [];
        }

        req.session.userInventory = inventory;

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
        res.redirect("/");
    });
});

const port = process.env.PORT || 5000; // <--- Ajustado: Usar a porta do ambiente (Render define PORT)
app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
})