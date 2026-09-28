// Configuração do app Web do Firebase (projeto "Agenda HCN").
// Para trocar: Console do Firebase → Configurações do projeto → Seus apps → Web.
// Se voltar para null, a agenda funciona em "modo local" (salva só neste aparelho).
//
// Estes valores não são secretos: quem protege os dados são as regras do
// Firestore (arquivo firestore.rules), que só deixam cada usuário ler/escrever o que é seu.

export const firebaseConfig = {
  apiKey: "AIzaSyDfahhKniuKspu6-tHJpNJ87ta2f3Wbdck",
  authDomain: "agenda-hcn.firebaseapp.com",
  projectId: "agenda-hcn",
  storageBucket: "agenda-hcn.firebasestorage.app",
  messagingSenderId: "142562690102",
  appId: "1:142562690102:web:17834c94dcc05ed78d0497",
};

// ID do cliente OAuth "Web" do Google Cloud (projeto agenda-hcn), usado para
// enviar eventos ao Google Agenda. Enquanto for null, a opção não aparece.
export const googleClientId = "142562690102-c1uac6p10o5l6hk0daok764u7nbjgqkp.apps.googleusercontent.com";
