/*
  LHS – Candidate module database
  01: Create the database and the candidates schema. Safe to re-run.
  Run with: sqlcmd -S localhost\SQLEXPRESS -E -I -b -v DatabaseName=LHS -i 01_create_database.sql
*/
SET NOCOUNT ON;

IF DB_ID(N'$(DatabaseName)') IS NULL
BEGIN
    PRINT 'Creating database $(DatabaseName)...';
    CREATE DATABASE [$(DatabaseName)];
END
ELSE
    PRINT 'Database $(DatabaseName) already exists.';
GO

ALTER DATABASE [$(DatabaseName)] SET RECOVERY SIMPLE;
ALTER DATABASE [$(DatabaseName)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

USE [$(DatabaseName)];
GO

IF SCHEMA_ID(N'candidates') IS NULL
    EXEC (N'CREATE SCHEMA candidates AUTHORIZATION dbo;');
GO
