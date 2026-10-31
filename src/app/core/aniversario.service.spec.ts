import { TestBed } from '@angular/core/testing';
import { AniversarioService } from './aniversario.service';
import { StoreService } from './store.service';
import type { Participante } from './models';

function participante(nome: string, nascimento?: string): Participante {
  return {
    id: crypto.randomUUID(),
    nome,
    papel: 'outro',
    nascimento,
    ativo: true,
    criadoEm: Date.now(),
  };
}

describe('AniversarioService', () => {
  let service: AniversarioService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AniversarioService, StoreService],
    });
    service = TestBed.inject(AniversarioService);
  });

  it('lista por proximidade e ignora quem não tem nascimento', () => {
    const hoje = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const lista = [
      participante('Sem data'),
      participante('Depois', iso(amanha)),
      participante('Hoje', iso(hoje)),
    ];

    const resultado = service.listar(lista);
    expect(resultado.map((a) => a.participante.nome)).toEqual(['Hoje', 'Depois']);
    expect(resultado[0].faltamDias).toBe(0);
    expect(resultado[1].faltamDias).toBe(1);
  });

  it('trata quem tem menos de 12 meses como faz anos hoje', () => {
    const hoje = new Date();
    const anoPassado = String(hoje.getFullYear() - 1);
    const iso = `${anoPassado}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    // Nasceu ano passado e o aniversário é hoje: já faz 1 ano.
    expect(service.idade(participante('Bebe', iso))).toBe(1);
  });

  it('calcula a idade conforme o aniversario ja passou ou nao', () => {
    const ano = new Date().getFullYear();
    const p = participante('Ana', `${ano - 30}-01-15`);
    const antes = new Date(`${ano}-06-01`); // o aniversário de janeiro já passou
    const antesDoAniversario = new Date(`${ano - 1}-12-31`);
    expect(service.idade(p, antes)).toBe(30);
    // Em 31/12 do ano anterior ainda não completou 30.
    expect(service.idade(p, antesDoAniversario)).toBe(29);
  });

  it('filtra pelo intervalo de dias pedido', () => {
    const hoje = new Date();
    const daquiADias = (n: number) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const lista = [
      participante('Hoje', daquiADias(0)),
      participante('Semana', daquiADias(7)),
      participante('Mes', daquiADias(40)),
    ];

    expect(service.proximos(7, lista).map((a) => a.participante.nome)).toEqual([
      'Hoje',
      'Semana',
    ]);
    expect(service.hoje(lista).map((a) => a.participante.nome)).toEqual(['Hoje']);
  });
});
// Valida a seleção e a ordenação das datas de aniversário próximas.
