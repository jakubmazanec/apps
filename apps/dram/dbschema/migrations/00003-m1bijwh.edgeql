CREATE MIGRATION m1bijwhvrwn7hq46imqan4x62fjrbdvfzcqop7yzg5nkipgpczlxna
    ONTO m1vwymtzlrezzduvnev7oeestqo745tul47t3ifw2nnlrccl3g5ayq
{
  ALTER TYPE default::Note {
      ALTER PROPERTY boughtAt {
          SET TYPE cal::local_date USING (<cal::local_date>.boughtAt);
      };
      ALTER PROPERTY order {
          SET readonly := true;
          CREATE CONSTRAINT std::exclusive;
      };
      ALTER PROPERTY tastedAt {
          SET TYPE cal::local_datetime USING (cal::to_local_datetime(.tastedAt, 'Europe/Prague'));
      };
  };
};
