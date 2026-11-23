// Camada de dados Adota Aí — módulos ES nativos, sem backend Node obrigatório.
import { supabase } from './supabase-client.js';
const unwrap = ({ data, error }) => { if (error) throw error; return data; };
async function uid() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Faça login para continuar.');
  return user.id;
}
const mapAnimal = a => ({
  id:a.id, name:a.nome, sex:a.sexo, species:a.especie, birthdate:a.nascimento,
  age:a.idade_descritiva, size:a.porte, breed:a.raca, city:a.cidade, img:a.imagem_url,
  desc:a.descricao, past:a.historico, medical:a.informacoes_medicas,
  castrated:a.castrado, specialNeed:a.necessidade_especial,
  singlePet:a.pet_unico, purpose:a.finalidade, status:a.status
});
const toAnimal = p => ({
  nome:p.name, sexo:p.sex, especie:p.species, nascimento:p.birthdate || null,
  idade_descritiva:p.age || null, porte:p.size, raca:p.breed, cidade:p.city,
  imagem_url:p.img, descricao:p.desc, historico:p.past,
  informacoes_medicas:p.medical, castrado:!!p.castrated,
  necessidade_especial:!!p.specialNeed, pet_unico:!!p.singlePet,
  finalidade:p.purpose || 'companhia'
});
const mapQuiz = q => q && ({
  species:q.especie || '', size:q.porte || '', age:q.idade || '',
  housing:q.moradia, activity:q.atividade, routine:q.rotina,
  kids:q.tem_criancas, otherPets:q.tem_outros_pets, acceptSpecial:q.aceita_especiais
});
export const backend = {
  auth: {
    async register(email, password, phone) {
      const tel=phone.replace(/\D/g,'');
      if (!/^\d{10,11}$/.test(tel)) throw new Error('Telefone inválido, informe DDD.');
      return unwrap(await supabase.auth.signUp({email,password,options:{data:{telefone:tel}}}));
    },
    async login(email,password) { return unwrap(await supabase.auth.signInWithPassword({email,password})); },
    async logout() { return unwrap(await supabase.auth.signOut()); },
    async session() { return unwrap(await supabase.auth.getSession()); },
    async profile() { return unwrap(await supabase.from('perfis').select('*').eq('id',await uid()).single()); }
  },
  quiz: {
    async get() { const d=unwrap(await supabase.from('questionarios').select('*').eq('adotante_id',await uid()).maybeSingle()); return mapQuiz(d); },
    async save(p) {
      const data={adotante_id:await uid(),especie:p.species||'',porte:p.size||'',idade:p.age||'',
        moradia:p.housing,atividade:p.activity,rotina:p.routine,tem_criancas:!!p.kids,
        tem_outros_pets:!!p.otherPets,aceita_especiais:!!p.acceptSpecial,atualizado_em:new Date().toISOString()};
      return unwrap(await supabase.from('questionarios').upsert(data,{onConflict:'adotante_id'}).select().single());
    }
  },
  animals: {
    async list() { return unwrap(await supabase.from('animais').select('*').order('id')).map(mapAnimal); },
    async managed() {
      const links=unwrap(await supabase.from('colaboradores_animais').select('animal_id').eq('colaborador_id',await uid()));
      if(!links.length) return [];
      return unwrap(await supabase.from('animais').select('*').in('id',links.map(x=>x.animal_id))).map(mapAnimal);
    },
    async save(p) {
      const body=toAnimal(p);
      if(p.id) return mapAnimal(unwrap(await supabase.from('animais').update(body).eq('id',p.id).select().single()));
      body.criado_por=await uid();
      return mapAnimal(unwrap(await supabase.from('animais').insert(body).select().single()));
    },
    async remove(id) { return unwrap(await supabase.from('animais').delete().eq('id',id)); }
  },
  likes: {
    async list() { return unwrap(await supabase.from('animais_curtidos').select('animal_id').eq('adotante_id',await uid())).map(x=>x.animal_id); },
    async add(id) { return unwrap(await supabase.from('animais_curtidos').upsert({adotante_id:await uid(),animal_id:id},{onConflict:'adotante_id,animal_id'})); },
    async remove(id) { return unwrap(await supabase.from('animais_curtidos').delete().eq('adotante_id',await uid()).eq('animal_id',id)); }
  },
  interests: {
    async mine() { return unwrap(await supabase.from('interesses').select('*').eq('adotante_id',await uid()).order('criado_em',{ascending:false})); },
    async forAnimal(id) { return unwrap(await supabase.from('interesses').select('*').eq('animal_id',id)); },
    async add(id) { return unwrap(await supabase.from('interesses').insert({adotante_id:await uid(),animal_id:id}).select().single()); },
    async updateStatus(id,status) { return unwrap(await supabase.from('interesses').update({status}).eq('id',id).select().single()); },
    async remove(id) { return unwrap(await supabase.from('interesses').delete().eq('id',id)); }
  },
  chat: {
    async list(interestId) { return unwrap(await supabase.from('mensagens').select('*').eq('interesse_id',interestId).order('criado_em')); },
    async send(interestId,text) { return unwrap(await supabase.from('mensagens').insert({interesse_id:interestId,remetente_id:await uid(),conteudo:text.trim()}).select().single()); },
    subscribe(interestId,onChange) {
      const channel=supabase.channel(`chat-${interestId}-${crypto.randomUUID()}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'mensagens',filter:`interesse_id=eq.${interestId}`},onChange).subscribe();
      return () => supabase.removeChannel(channel);
    }
  }
};
