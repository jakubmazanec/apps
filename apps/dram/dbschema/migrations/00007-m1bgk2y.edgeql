CREATE MIGRATION m1bgk2yufm6qxfy5j7qvxl3hney7o7yoi34gsa5oo3yh34hukpwzgq
    ONTO m1spl5okaliwfwwvypq7uwcr2whanv5v4nekslsclimq4mflsjgzya
{
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (std::to_str(.age));
  };
};
