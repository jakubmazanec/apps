CREATE MIGRATION m1qsiy7ls4pmcpkv6zdo3v2b4sqn6savvpliryltzve3evm6kz5rqa
    ONTO m132rgfdvb3wlrn6vojwhx6vzsop46gvc3oletiz7g4shlxajo4wqq
{
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (std::to_str(.strength));
      CREATE INDEX ext::pg_trgm::gin ON (std::to_str(.age));
  };
};
