import { transpor, distancia, slugificar } from './cifra.service';

describe('transpor', () => {
  it('sube o tom preservando o sufixo minimo', () => {
    expect(transpor('C', 2)).toBe('D');
    expect(transpor('Am', 2)).toBe('Bm');
  });

  it('desce o tom', () => {
    expect(transpor('G', -2)).toBe('F');
    expect(transpor('F#m', -2)).toBe('Em');
  });

  it('mantem bemol quando o acorde original usa bemol', () => {
    // Eb + 2 = F ; o semitono 3 em bemol e' Db, e o padrao F ja e' natural.
    expect(transpor('Ebm', 2)).toBe('Fm');
    // Gb + 2 = Ab ; sem a regra, sairia G#.
    expect(transpor('Gb', 2)).toBe('Ab');
  });

  it('mantem sustenh quando o acorde original usa sustenh', () => {
    expect(transpor('C#', 2)).toBe('D#');
  });

  it('envolve ao passar do B', () => {
    expect(transpor('B', 1)).toBe('C');
  });

  it('devolve a cifra intacta sem deslocamento', () => {
    expect(transpor('G\n  Am\n  C', 0)).toBe('G\n  Am\n  C');
  });

  it('mantem acordes com extensao de degree', () => {
    expect(transpor('Csus4', 2)).toBe('Dsus4');
  });
});

describe('distancia', () => {
  it('calcula a distancia em semitons', () => {
    expect(distancia('C', 'G')).toBe(7);
    expect(distancia('G', 'C')).toBe(5);
    expect(distancia('C', 'C')).toBe(0);
  });

  it('trata bemol e sustenh como equivalentes', () => {
    expect(distancia('C', 'Db')).toBe(1);
  });
});

describe('slugificar', () => {
  it('converte titulo em slug do Cifra Club', () => {
    expect(slugificar('The Scientist')).toBe('the-scientist');
  });

  it('remove acentos', () => {
    expect(slugificar('Minha Adoração, Senhor')).toBe('minha-adoracao-senhor');
    expect(slugificar('Gonçalves')).toBe('goncalves');
  });

  it('normaliza espacos e simbolos', () => {
    expect(slugificar('  O   Nosso  Deus  ')).toBe('o-nosso-deus');
    expect(slugificar("Jesus, o Cordeiro (Ao Vivo)")).toBe('jesus-o-cordeiro-ao-vivo');
  });
});
// Confere as regras de busca, normalização e transposição de cifras.
