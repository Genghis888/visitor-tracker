// Cria (ou atualiza a senha de) um usuário admin.
//
// Uso:
//   node scripts/createAdmin.js <usuario> <senha>
//
// Exemplo:
//   node scripts/createAdmin.js admin minhaSenhaForte123

import dotenv from "dotenv";
import { createUser } from "../services/authService.js";
import pool from "../db.js";

dotenv.config();

const [, , username, password] = process.argv;

if (!username || !password) {

    console.error("Uso: node scripts/createAdmin.js <usuario> <senha>");

    process.exit(1);

}

if (password.length < 8) {

    console.error("A senha deve ter pelo menos 8 caracteres.");

    process.exit(1);

}

try {

    const user = await createUser(username, password);

    console.log(`✅ Usuário "${user.username}" criado/atualizado com sucesso.`);

} catch (err) {

    console.error("Erro ao criar usuário:", err.message);

    process.exitCode = 1;

} finally {

    await pool.end();

}
