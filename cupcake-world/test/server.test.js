// test/server.test.js

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../server'); // Ajuste o caminho se necessário

describe('Testes da API do Servidor', function() {
  // Variáveis para armazenar dados de teste
  let agent = request.agent(app);
  let testUserId;

  // Aumentar o timeout para operações assíncronas
  this.timeout(10000);

  // Função utilitária para gerar e-mails aleatórios
  function getRandomEmail() {
    return `testuser_${Date.now()}@example.com`;
  }

  // -------------------- Testes de Registro --------------------
  describe('POST /register', function() {
    it('deve registrar um novo usuário', function(done) {
      const email = getRandomEmail();
      agent
        .post('/register')
        .send({
          nome: 'Usuário Teste',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678900',
          senha: 'senha123',
          confirmar_senha: 'senha123',
          telefone: '11999999999'
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Cadastro realizado com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve registrar um usuário com e-mail ou CPF já existentes', function(done) {
      const email = getRandomEmail();
      const cpf = '12345678901';

      // Primeiro, registra o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Existente',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: cpf,
          senha: 'senha123',
          confirmar_senha: 'senha123',
          telefone: '11999999999'
        })
        .then(() => {
          // Tenta registrar novamente com o mesmo e-mail
          agent
            .post('/register')
            .send({
              nome: 'Usuário Existente',
              email: email,
              data_nascimento: '1990-01-01',
              cpf: '98765432100', // CPF diferente
              senha: 'senha123',
              confirmar_senha: 'senha123',
              telefone: '11999999999'
            })
            .expect('Content-Type', /json/)
            .expect(200)
            .then(response => {
              expect(response.body.success).to.be.false;
              expect(response.body.message).to.equal('Usuário já cadastrado com este e-mail ou CPF.');
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Login --------------------
  describe('POST /login', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra o usuário primeiro
      agent
        .post('/register')
        .send({
          nome: 'Usuário Login',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678902',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => done())
        .catch(err => done(err));
    });

    it('deve logar um usuário existente', function(done) {
      agent
        .post('/login')
        .send({
          email: email,
          senha: senha
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Login realizado com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve logar com senha incorreta', function(done) {
      agent
        .post('/login')
        .send({
          email: email,
          senha: 'senhaincorreta'
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Senha incorreta.');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Dados do Usuário --------------------
  describe('GET /user-data', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Dados',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678903',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              testUserId = agent.jar.getCookie('connect.sid').value;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve obter os dados do usuário quando autenticado', function(done) {
      agent
        .get('/user-data')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.data.email).to.equal(email);
          done();
        })
        .catch(err => done(err));
    });

    it('não deve obter os dados do usuário quando não autenticado', function(done) {
      request(app)
        .get('/user-data')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Usuário não autenticado.');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Logout --------------------
  describe('POST /logout', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Logout',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678904',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve fazer logout do usuário', function(done) {
      agent
        .post('/logout')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Logout realizado com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve obter os dados do usuário após logout', function(done) {
      agent
        .get('/user-data')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Usuário não autenticado.');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes do Suporte --------------------
  describe('POST /suporte', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Suporte',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678905',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve enviar uma solicitação de suporte para usuário autenticado', function(done) {
      agent
        .post('/suporte')
        .send({
          mensagem: 'Preciso de ajuda com meu pedido.',
          motivo: ['Pedido errado']
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Sua solicitação de suporte foi enviada com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('deve enviar uma solicitação de suporte para usuário não autenticado', function(done) {
      request(app)
        .post('/suporte')
        .send({
          nome: 'Usuário Anônimo',
          email: 'anonimo@example.com',
          telefone: '11999999999',
          mensagem: 'Tenho uma dúvida sobre os produtos.',
          motivo: ['Sugestão']
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Sua solicitação de suporte foi enviada com sucesso!');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Atualização de Preferências --------------------
  describe('POST /update-preferences', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Preferências',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678906',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve atualizar as preferências do usuário', function(done) {
      agent
        .post('/update-preferences')
        .send({
          preferencias_notific: ['E-mail', 'SMS']
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Preferências atualizadas com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve atualizar preferências quando não autenticado', function(done) {
      request(app)
        .post('/update-preferences')
        .send({
          preferencias_notific: ['E-mail']
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Usuário não autenticado.');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Atualização de Perfil --------------------
  describe('POST /update-profile', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Perfil',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678907',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve atualizar o perfil do usuário', function(done) {
      agent
        .post('/update-profile')
        .send({
          nome: 'Usuário Atualizado',
          cpf: '12345678907',
          data_nascimento: '1990-01-01',
          telefone: '11988888888',
          email: email,
          senha: 'novaSenha123'
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.message).to.equal('Cadastro atualizado com sucesso!');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve atualizar o perfil quando não autenticado', function(done) {
      request(app)
        .post('/update-profile')
        .send({
          nome: 'Hacker',
          cpf: '00000000000',
          data_nascimento: '2000-01-01',
          telefone: '1100000000',
          email: 'hacker@example.com',
          senha: 'hackeado'
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Usuário não autenticado.');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Criação de Pedido --------------------
  // Nota: Este teste irá interagir com o Shopify e o Airtable. Certifique-se de ter configurações válidas.

  describe('POST /create-order', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Pedido',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678908',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve criar um pedido e retornar a URL de checkout', function(done) {
      // Use um variantId válido da sua loja Shopify
      const testVariantId = 'gid://shopify/ProductVariant/1234567890'; // Substitua por um variantId válido

      agent
        .post('/create-order')
        .send({
          cart: [
            {
              nome: 'Produto Teste',
              preco: '10.00',
              cobertura: 'Chocolate',
              confeite: 'Granulado',
              variantId: testVariantId,
              quantidade: 1
            }
          ]
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.checkoutUrl).to.be.a('string');
          done();
        })
        .catch(err => done(err));
    });
  });

  // -------------------- Testes de Obtenção de Pedidos --------------------
  describe('GET /get-orders', function() {
    const email = getRandomEmail();
    const senha = 'senha123';

    before(function(done) {
      // Registra e loga o usuário
      agent
        .post('/register')
        .send({
          nome: 'Usuário Pedidos',
          email: email,
          data_nascimento: '1990-01-01',
          cpf: '12345678909',
          senha: senha,
          confirmar_senha: senha,
          telefone: '11999999999'
        })
        .then(() => {
          agent
            .post('/login')
            .send({
              email: email,
              senha: senha
            })
            .then(response => {
              expect(response.body.success).to.be.true;
              done();
            })
            .catch(err => done(err));
        })
        .catch(err => done(err));
    });

    it('deve obter os pedidos para o usuário autenticado', function(done) {
      agent
        .get('/get-orders')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          expect(response.body.success).to.be.true;
          expect(response.body.orders).to.be.an('array');
          done();
        })
        .catch(err => done(err));
    });

    it('não deve obter pedidos quando não autenticado', function(done) {
      request(app)
        .get('/get-orders')
        .expect('Content-Type', /json/)
        .expect(401)
        .then(response => {
          expect(response.body.success).to.be.false;
          expect(response.body.message).to.equal('Usuário não autenticado.');
          done();
        })
        .catch(err => done(err));
    });
  });
});
