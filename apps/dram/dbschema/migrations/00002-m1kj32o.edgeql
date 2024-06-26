CREATE MIGRATION m1kj32oarldfpow6leynt4qsskqpcwwlmj7wrhh7gbkzaztuiz7yxq
    ONTO m1iojcap6lzzdfmjbif4rxtird2fgbygqsduxm43b54qtvbk5a663q
{
  ALTER TYPE default::Note {
      ALTER PROPERTY bottleNumber {
          SET TYPE std::str USING (<std::str>.bottleNumber);
      };
  };
};
