
SELECT DISTINCT r.codigo, r.descricao, r.tipo
FROM datalake_v2.pessoas p
JOIN datalake_v2.vinculos v ON v.pessoa_id = p.id
JOIN datalake_v2.contracheques c ON c.vinculo_id = v.id
JOIN datalake_v2.itens_contracheque i ON i.contracheque_id = c.id
JOIN datalake_v2.rubricas r ON r.id = i.rubrica_id
WHERE p.nome ILIKE '%abel gomes%'
ORDER BY r.descricao
LIMIT 30;
