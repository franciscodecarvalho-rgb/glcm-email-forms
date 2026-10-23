
SELECT count(i.id)
FROM datalake_v2.rubricas r
JOIN datalake_v2.itens_contracheque i ON i.rubrica_id = r.id
WHERE r.descricao_normalizada LIKE '%banco de horas%';
