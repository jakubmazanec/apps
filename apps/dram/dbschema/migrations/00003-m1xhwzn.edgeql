CREATE MIGRATION m1xhwznq2ycyxhuwfvgp4c64grikzr46gva4waunkupkjwhabv5zcq
    ONTO m1kj32oarldfpow6leynt4qsskqpcwwlmj7wrhh7gbkzaztuiz7yxq
{
  ALTER TYPE default::Note {
      ALTER PROPERTY caskNnumber {
          RENAME TO caskNumber;
      };
  };
};
